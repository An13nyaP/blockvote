const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("VotingModule", (m) => {
  // 1. Deploy the Verifier contract
  const verifier = m.contract("SemaphoreVerifier");

  // 2. Deploy the PoseidonT3 library
  const poseidonT3 = m.library("PoseidonT3");

  // 3. Deploy the MAIN 'Semaphore.sol' contract
  const semaphoreContract = m.contract("Semaphore", [verifier], {
    libraries: {
      PoseidonT3: poseidonT3,
    },
  });

  // 4. --- NEW: Deploy the CPT token contract ---
  const cptContract = m.contract("CPT");

  // 5. Deploy our 'Voting.sol' contract
  //    It now takes TWO addresses: Semaphore and CPT
  const votingContract = m.contract("Voting", [
    semaphoreContract,
    cptContract,
  ]);

  // 6. --- NEW: Transfer CPT ownership to the Voting contract ---
  //    This allows the Voting contract to call the 'mint' function.
  //    We add a 'dependsOn' to make sure it happens *after* deployment.
  const transferOwnership = m.call(
    cptContract,
    "transferOwnership",
    [votingContract],
    {
      dependsOn: [votingContract],
    }
  );

  // We add 'cptContract' to the return
  return { votingContract, semaphoreContract, verifier, cptContract };
});