// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import "hardhat/console.sol";

// We define a simple interface so Voting can talk to the Factory
interface IVotingFactory {
    function distributeReward(address recipient) external;
}

contract Voting {
    // --- State Variables ---
    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    mapping(uint => Candidate) public candidates;
    uint public candidatesCount;

    ISemaphore public semaphore;
    uint256 public groupId;

    // NEW: Store the Election Organizer and the Factory address
    address public owner;
    address public factory;
    string public electionTitle;
    bool public isOpen;

    // --- Events ---
    event Voted(uint indexed candidateId);
    event MemberJoined(uint256 indexed groupId, uint256 identityCommitment);
    event NewCandidate(uint id, string name);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can do this");
        _;
    }

    // --- Constructor ---
    // Updated to accept Owner and Title dynamically
    constructor(
        address _semaphoreAddress,
        address _factoryAddress,
        address _owner,
        string memory _title
    ) {
        console.log("Deploying Voting Template...");

        semaphore = ISemaphore(_semaphoreAddress);
        factory = _factoryAddress;
        owner = _owner;
        electionTitle = _title;
        isOpen = true;

        // Create group. The Voting Contract itself becomes the group admin.
        groupId = semaphore.createGroup();
        console.log("Semaphore group created with ID:", groupId);
    }

    // --- Admin Functions ---
    // Changed from 'private' to 'public onlyOwner' so Organizer can add candidates
    function addCandidate(string memory _name) public onlyOwner {
        require(isOpen, "Election closed");
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, _name, 0);
        emit NewCandidate(candidatesCount, _name);
    }

    function endElection() public onlyOwner {
        isOpen = false;
    }

    // --- Voter Registration ---
    function joinGroup(uint256 identityCommitment) external {
        require(isOpen, "Election closed");
        semaphore.addMember(groupId, identityCommitment);
        emit MemberJoined(groupId, identityCommitment);
    }

    // --- Anonymous Vote ---
    function anonymousVote(
        uint256 candidateId,
        ISemaphore.SemaphoreProof calldata proof,
        address recipient
    ) external {
        require(isOpen, "Election closed");

        // 1. Validation
        require(
            candidateId > 0 && candidateId <= candidatesCount,
            "Error: Invalid candidate ID."
        );
        require(
            proof.scope == groupId,
            "Error: Proof is for the wrong election."
        );
        require(
            proof.message == candidateId,
            "Error: Proof signal does not match candidateId."
        );

        // 2. ZKP Verification
        semaphore.validateProof(groupId, proof);

        // 3. State Update
        candidates[candidateId].voteCount++;
        emit Voted(candidateId);

        // 4. REWARD (Via Factory)
        // Instead of minting directly, we ask the Factory to mint
        IVotingFactory(factory).distributeReward(recipient);
    }

    // Helper for Frontend
    function getAllCandidates() public view returns (Candidate[] memory) {
        Candidate[] memory allCandidates = new Candidate[](candidatesCount);
        for (uint i = 1; i <= candidatesCount; i++) {
            allCandidates[i - 1] = candidates[i];
        }
        return allCandidates;
    }
}
