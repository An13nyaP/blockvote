import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

import VotingContractABI from "../artifacts/Voting.json";

const CONTRACT_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [group, setGroup] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const connectWallet = async () => {
    if (!window.ethereum) return setMessage("Please install MetaMask!");
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);
      const rpcUrl = "http://127.0.0.1:8545";
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(provider);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      setSigner(signer);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        VotingContractABI.abi,
        provider
      );
      setContract(contract);
      loadCandidates(contract);
      loadGroup(contract);
    } catch (error) {
      console.error("Error connecting:", error);
      setMessage("Error connecting to wallet.");
    }
  };

  const loadCandidates = async (contractInstance) => {
    try {
      const count = await contractInstance.candidatesCount();
      const candidatesArray = [];
      for (let i = 1; i <= Number(count); i++) {
        const candidate = await contractInstance.candidates(i);
        candidatesArray.push(candidate);
      }
      setCandidates(candidatesArray);
      console.log("Candidates loaded");
    } catch (error) {
      console.error("Error loading candidates:", error);
      setMessage("Error loading candidates.");
    }
  };

  const loadGroup = async (contractInstance) => {
    try {
      const id = await contractInstance.groupId();
      setGroupId(Number(id));
      console.log("Group ID loaded:", Number(id));

      const semaphoreAddress = await contractInstance.semaphore();
      console.log("Semaphore contract address:", semaphoreAddress);

      const semaphoreABI = [
        "event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)"
      ];
      const contractProvider = contractInstance.runner.provider || contractInstance.provider;
      const semaphoreContract = new ethers.Contract(semaphoreAddress, semaphoreABI, contractProvider);

      const filter = semaphoreContract.filters.MemberAdded(id);
      const events = await semaphoreContract.queryFilter(filter, 0, "latest");

      console.log("Found", events.length, "MemberAdded events");

      const members = events.map(event => event.args.identityCommitment);
      const group = new Group(members);
      setGroup(group);

      console.log("Group members loaded:", members.length, "members");
      console.log("Local group root:", group.root.toString());

      if (events.length > 0) {
        console.log("Contract's latest root:", events[events.length - 1].args.merkleTreeRoot.toString());
      }
    } catch (error) {
      console.error("Error loading group:", error);
      setMessage("Error loading group data.");
    }
  };

  const createIdentity = () => {
    const newIdentity = new Identity();
    setIdentity(newIdentity);
    localStorage.setItem("blockvote-identity", newIdentity.export());
    setMessage("New identity created & saved in browser.");
  };

  useEffect(() => {
    const storedIdentity = localStorage.getItem("blockvote-identity");
    if (storedIdentity) {
      const identity = new Identity(storedIdentity);
      setIdentity(identity);
      console.log("Identity loaded from storage.");
    }
  }, []);

  const joinGroup = async () => {
    if (!contract || !signer || !identity) return setMessage("Connect wallet & create identity first.");

    const identityCommitment = identity.commitment;
    if (group && group.members && group.members.indexOf(identityCommitment) !== -1) {
      setMessage("You are already a registered member of this group!");
      return;
    }

    setLoading(true);
    setMessage("Submitting registration... (Confirm in MetaMask)");
    try {
      const commitment = identity.commitment;
      const tx = await contract.connect(signer).joinGroup(commitment);
      await tx.wait();
      setMessage("Successfully registered to vote!");
      setLoading(false);
      loadGroup(contract);
    } catch (error) {
      console.error("Error joining group:", error);
      setMessage(error.reason || "Error joining group.");
      setLoading(false);
    }
  };

  const voteForCandidate = async (candidateId) => {
    if (!contract || !signer || !identity || !group) {
      return setMessage("Please connect, create ID, and join group first.");
    }

    if (groupId === null || groupId === undefined) {
      return setMessage("Error: Group ID not loaded. Please refresh and try again.");
    }

    const identityCommitment = identity.commitment;
    if (!group.members || group.members.indexOf(identityCommitment) === -1) {
      setMessage("Error: Your identity is not registered in this group. Please join first.");
      return;
    }

    setLoading(true);
    setMessage(`Generating ZK-Proof for Candidate ${candidateId}... (this may take 10-20s)`);
    const id = Number(candidateId);
    try {
      // Reload the group to ensure we have the latest state
      await loadGroup(contract);

      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if group state updated
      if (!group || !group.members || group.members.indexOf(identityCommitment) === -1) {
        setMessage("Error: Group state changed. Please try again.");
        setLoading(false);
        return;
      }

      const contractGroupId = await contract.groupId();
      console.log("Contract groupId:", contractGroupId.toString());
      console.log("Current group root:", group.root.toString());

      const message = BigInt(id);
      const scope = contractGroupId;

      console.log("Generating proof with:", {
        message: message.toString(),
        scope: scope.toString(),
        candidateId: id,
        groupMembersCount: group.members.length
      });

      const fullProof = await generateProof(identity, group, message, scope, 20);

      console.log("=== FULL PROOF GENERATED ===");
      console.log("Proof root:", fullProof.merkleTreeRoot.toString());
      console.log("Group root:", group.root.toString());
      console.log("Roots match:", fullProof.merkleTreeRoot.toString() === group.root.toString());

      // Convert points array strings to BigInt
      const points = fullProof.points.map(p => BigInt(p));

      const solidityProof = {
        merkleTreeDepth: fullProof.merkleTreeDepth,
        merkleTreeRoot: fullProof.merkleTreeRoot,
        nullifier: fullProof.nullifier,
        message: fullProof.message,
        scope: fullProof.scope,
        points: points
      };

      console.log("=== SOLIDITY PROOF ===");
      console.log("Complete proof object:", solidityProof);

      setMessage("Proof generated! Submitting vote... (Confirm in MetaMask)");
      // Send the transaction with the candidate ID, the proof, AND the voter's address
      const tx = await contract.connect(signer).anonymousVote(id, solidityProof, account);
      await tx.wait();
      setMessage("Vote successful!");
      setLoading(false);
      loadCandidates(contract);
    } catch (error) {
      console.error("Error voting:", error);
      setMessage(error.reason || (error.message || "Error submitting vote."));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-6 text-center">BlockVote+ (Phase 2)</h1>
        {message && (<p className="mb-4 p-3 bg-red-800 rounded-lg text-center font-mono">{message}</p>)}
        {loading && (<p className="mb-4 p-3 bg-blue-800 rounded-lg text-center font-mono">Loading...</p>)}
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <h2 className="text-2xl font-semibold mb-3">Step 1: Connect Wallet</h2>
          {!account ? (
            <button onClick={connectWallet} className="w-full px-4 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition">
              Connect Wallet
            </button>
          ) : (
            <p className="text-center bg-gray-700 p-3 rounded-lg font-mono text-sm">{account}</p>
          )}
        </div>
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <h2 className="text-2xl font-semibold mb-3">Step 2: Get Identity</h2>
          {identity ? (
            <p className="text-center bg-gray-700 p-3 rounded-lg font-mono text-sm break-all">
              Identity (Secret) stored in browser. Commitment: {identity.commitment.toString().substring(0, 20)}...
            </p>
          ) : (
            <button onClick={createIdentity} className="w-full px-4 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition">
              Create New Identity
            </button>
          )}
        </div>
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <h2 className="text-2xl font-semibold mb-3">Step 3: Register to Vote</h2>
          <p className="text-sm text-gray-400 mb-3">
            You must register your identity with the group before you can vote. (Group ID: {groupId})
          </p>
          <button onClick={joinGroup} disabled={!identity || !contract || loading} className="w-full px-4 py-3 bg-green-600 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50">
            Join Group (Register)
          </button>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <h2 className="text-2xl font-semibold mb-3">Step 4: Vote Anonymously</h2>
          <div className="mt-4 space-y-4">
            {candidates.map((candidate) => (
              <div key={Number(candidate.id)} className="bg-gray-700 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-xl font-semibold">{candidate.name}</p>
                  <p className="text-blue-400">Votes: {Number(candidate.voteCount)}</p>
                </div>
                <button onClick={() => voteForCandidate(candidate.id)} disabled={!identity || !group || loading} className="px-5 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                  Vote
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;