// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 1. We only import the INTERFACES
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import "hardhat/console.sol";
import "./CPT.sol"; // <-- 1. IMPORT ADDED

contract Voting {
    // --- State Variables ---

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    mapping(uint => Candidate) public candidates;
    uint public candidatesCount;

    // 2. We store an INSTANCE of the Semaphore contract
    ISemaphore public semaphore;
    uint256 public groupId;

    CPT public cpt; // <-- 2. TOKEN CONTRACT VARIABLE ADDED

    // --- Events ---
    event Voted(uint indexed candidateId);
    event MemberJoined(uint256 indexed groupId, uint256 identityCommitment);

    // --- Constructor ---
    // 3. We now take BOTH addresses
    constructor(address _semaphoreAddress, address _cptAddress) {
        // <-- 3. CONSTRUCTOR UPDATED
        console.log("Deploying PRIVACY Voting Contract (Phase 3)...");

        semaphore = ISemaphore(_semaphoreAddress);
        cpt = CPT(_cptAddress); // <-- 3. CONSTRUCTOR UPDATED

        // 4. We call the EXTERNAL 'createGroup' function
        groupId = semaphore.createGroup();

        console.log("Semaphore group created with ID:", groupId);

        addCandidate("Candidate 1");
        addCandidate("Candidate 2");
    }

    // --- Helper Function (No change) ---
    function addCandidate(string memory _name) private {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, _name, 0);
    }

    // --- Voter Registration Function ---
    // 5. We call the EXTERNAL 'addMember' function
    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);
        emit MemberJoined(groupId, identityCommitment);
    }

    // --- Anonymous Vote Function ---
    // 6. We use the 'ISemaphore.SemaphoreProof' type
    function anonymousVote(
        uint256 candidateId,
        ISemaphore.SemaphoreProof calldata proof,
        address recipient // <-- 4. RECIPIENT ADDRESS ADDED
    ) external {
        // --- 1. Validation ---
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

        // --- 2. ZKP MAGIC ---
        // 7. We call the EXTERNAL 'validateProof' function
        semaphore.validateProof(groupId, proof);

        // --- 3. State Update ---
        candidates[candidateId].voteCount++;

        // --- 4. Emit Event ---
        emit Voted(candidateId);

        // --- 5. MINT TOKEN (THE REWARD) ---
        // We mint 1 CPT (which has 18 decimals)
        cpt.mint(recipient, 1 * 10 ** 18); // <-- 5. MINT CALL ADDED
    }
}
