const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("VotingFactoryModule", (m) => {
  // 1. Deploy Semaphore dependencies (SAME AS BEFORE)
  const verifier = m.contract("SemaphoreVerifier");
  const poseidonT3 = m.library("PoseidonT3");
  const semaphoreContract = m.contract("Semaphore", [verifier], {
    libraries: {
      PoseidonT3: poseidonT3,
    },
  });

  // 2. Deploy CPT Token
  const cptContract = m.contract("CPT");

  // 3. Deploy the FACTORY (Instead of Voting)
  // It takes Semaphore and CPT addresses
  const votingFactory = m.contract("VotingFactory", [
    semaphoreContract,
    cptContract,
  ]);

  // 4. Transfer CPT Ownership to the FACTORY
  // This allows the Factory to mint tokens when requested by elections
  const transferOwnership = m.call(
    cptContract,
    "transferOwnership",
    [votingFactory],
    {
      dependsOn: [votingFactory],
    }
  );

  return { votingFactory, semaphoreContract, verifier, cptContract };
});