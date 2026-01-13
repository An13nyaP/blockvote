// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Voting.sol";
import "./CPT.sol";

contract VotingFactory {
    // Array of all elections created
    address[] public deployedElections;

    // Mapping to check if an address is a valid election (for security)
    mapping(address => bool) public isElection;

    // Mapping for easy title lookup
    mapping(address => string) public electionTitles;

    address public semaphoreAddress;
    CPT public cpt;

    event ElectionCreated(
        address indexed electionAddress,
        string title,
        address indexed owner
    );
    event RewardDistributed(
        address indexed election,
        address indexed recipient
    );

    constructor(address _semaphoreAddress, address _cptAddress) {
        semaphoreAddress = _semaphoreAddress;
        cpt = CPT(_cptAddress);
    }

    function createElection(string memory _title) public {
        // Deploy a new Voting contract
        Voting newElection = new Voting(
            semaphoreAddress,
            address(this), // Factory is the 'factoryAddress'
            msg.sender, // User is the 'owner'
            _title
        );

        address electionAddr = address(newElection);

        deployedElections.push(electionAddr);
        isElection[electionAddr] = true;
        electionTitles[electionAddr] = _title;

        emit ElectionCreated(electionAddr, _title, msg.sender);
    }

    // This function can ONLY be called by a valid Voting contract
    function distributeReward(address recipient) external {
        require(isElection[msg.sender], "Caller is not a valid election");

        // Factory calls the Token Contract (Factory must be the Owner of CPT)
        cpt.mint(recipient, 1 * 10 ** 18);

        emit RewardDistributed(msg.sender, recipient);
    }

    function getDeployedElections() public view returns (address[] memory) {
        return deployedElections;
    }
}
