// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import the standard ERC-20 and Ownable contracts
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Your contract is an ERC20 token that is also "Ownable"
contract CPT is ERC20, Ownable {
    // The ERC20 constructor takes the token's name and symbol
    // The Ownable constructor sets the deployer as the owner
    constructor()
        ERC20("Civic Participation Token", "CPT")
        Ownable(msg.sender)
    {
        // This just sets the initial owner
    }

    /**
     * @dev Creates 'amount' tokens and assigns them to 'to'.
     * Only the "owner" (which we will set to our Voting contract)
     * can call this function.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
