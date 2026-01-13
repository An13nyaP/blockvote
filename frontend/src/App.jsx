import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import {
  Home, UserPlus, Vote, BarChart3, Wallet,
  CheckCircle, Lock, ShieldCheck, AlertCircle, Settings,
  Plus, ArrowRight, Award, HelpCircle, Info, User, Zap, Sparkles, Ghost, Database
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';

// --- ARTIFACT IMPORTS ---
// Ensure these paths exist in your project.
// If Vercel fails to find them, move the JSON files to the 'src' folder and update these imports to "./Voting.json" etc.
import VotingABI from "../artifacts/contracts/Voting.sol/Voting.json";
import FactoryABI from "../artifacts/contracts/VotingFactory.sol/VotingFactory.json";
import CptABI from "../artifacts/contracts/CPT.sol/CPT.json";

// --- CONFIGURATION ---
const FACTORY_ADDRESS = "0x13AA23DA8ea256D41Ca9F4b4e727B5d9454f6D7B";// Backup: "https://rpc.sepolia.org"
const SEPOLIA_RPC_URL = "https://gateway.tenderly.co/public/sepolia";

function App() {
  // --- STATE ---
  const [view, setView] = useState("landing"); // 'landing', 'lobby', 'dashboard'
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Data State
  const [cptBalance, setCptBalance] = useState("0");
  const [factoryContract, setFactoryContract] = useState(null);
  const [elections, setElections] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [newElectionTitle, setNewElectionTitle] = useState("");

  // Selected Election State
  const [selectedElection, setSelectedElection] = useState(null);
  const [votingContract, setVotingContract] = useState(null);
  const [electionTitle, setElectionTitle] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const [hasVoted, setHasVoted] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);

  const [identity, setIdentity] = useState(null);
  const [group, setGroup] = useState(null);
  const [candidates, setCandidates] = useState([]);

  // ==========================================
  // 🚀 INITIALIZATION
  // ==========================================

  useEffect(() => {
    const init = async () => {
      // 1. Load Read-Only Data (Factory) using Public Sepolia Node
      try {
        const readProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
        const readFactory = new ethers.Contract(FACTORY_ADDRESS, FactoryABI.abi, readProvider);
        await loadElections(readFactory);
      } catch (e) {
        console.log("Could not load elections from public node:", e);
      }

      // 2. Auto-Connect Wallet if available
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) connectWallet();
        } catch (e) {
          console.error("Auto-connect failed", e);
        }
      }
    };
    init();
  }, []);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) return setMessage("Please install MetaMask");

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setProvider(provider);
      setSigner(signer);

      const factory = new ethers.Contract(FACTORY_ADDRESS, FactoryABI.abi, signer);
      setFactoryContract(factory);

      // Reload elections with signer to be safe, though read-only worked above
      loadElections(factory);
      fetchCPTBalance(factory, signer, accounts[0]);

    } catch (error) {
      console.error(error);
      setMessage("Connection failed");
    }
  };

  const fetchCPTBalance = async (factory, signer, userAddress) => {
    try {
      const cptAddress = await factory.cpt();
      const cptContract = new ethers.Contract(cptAddress, CptABI.abi, signer);
      const rawBalance = await cptContract.balanceOf(userAddress);
      const formatted = ethers.formatUnits(rawBalance, 18);
      setCptBalance(parseFloat(formatted).toFixed(1));
    } catch (e) {
      console.error("Could not fetch CPT balance", e);
    }
  };

  // ==========================================
  // 🧠 LOGIC FUNCTIONS
  // ==========================================

  const loadElections = async (factory) => {
    try {
      const addresses = await factory.getDeployedElections();
      const list = [];
      for (const addr of addresses) {
        const title = await factory.electionTitles(addr);
        list.push({ address: addr, title: title });
      }
      setElections(list);
    } catch (e) { console.error("Error loading elections:", e); }
  };

  const createElection = async () => {
    if (!newElectionTitle) return setMessage("Title required");
    setLoading(true);
    try {
      const tx = await factoryContract.createElection(newElectionTitle);
      await tx.wait();
      setMessage("Election Created!");
      setNewElectionTitle("");
      setShowCreateModal(false);
      await loadElections(factoryContract);
    } catch (e) {
      console.error(e);
      setMessage("Failed to create election");
    }
    setLoading(false);
  };

  const enterElection = async (addr, title) => {
    if (!signer) return setMessage("Please connect wallet first");
    setLoading(true);
    try {
      const contract = new ethers.Contract(addr, VotingABI.abi, signer);
      setVotingContract(contract);
      setSelectedElection(addr);
      setElectionTitle(title);
      setView("dashboard");
      setActiveTab("home");

      const owner = await contract.owner();
      setIsOrganizer(owner.toLowerCase() === account.toLowerCase());

      const voteKey = `voted_${addr}_${account}`;
      const voted = localStorage.getItem(voteKey);
      setHasVoted(!!voted);
      if (voted) setActiveTab("results");

      await loadCandidates(contract);
      await loadGroup(contract);
    } catch (e) {
      console.error(e);
      setMessage("Failed to enter election");
    }
    setLoading(false);
  };

  const loadCandidates = async (contract) => {
    try {
      const list = await contract.getAllCandidates();
      setCandidates(list.map(c => ({ id: Number(c.id), name: c.name, voteCount: Number(c.voteCount) })));
    } catch (e) {
      console.error("Error loading candidates", e);
    }
  };

  const loadGroup = async (contract) => {
    try {
      const id = await contract.groupId();
      const semAddr = await contract.semaphore();

      // FIX: Always use public node for Semaphore events to avoid local node errors
      const rProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

      const semABI = ["event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)"];
      const semContract = new ethers.Contract(semAddr, semABI, rProvider);

      // Fetch events from the Sepolia blockchain
      const events = await semContract.queryFilter(semContract.filters.MemberAdded(id), 0, "latest");
      const members = events.map(e => e.args.identityCommitment);

      setGroup(new Group(members));
    } catch (e) {
      console.error("Error loading group members:", e);
    }
  };

  // --- ZK LOGIC ---
  const createIdentity = () => {
    const newIdentity = new Identity();
    setIdentity(newIdentity);
    localStorage.setItem("blockvote-identity", newIdentity.export());
    setMessage("Secret Identity Generated!");
  };

  useEffect(() => {
    const saved = localStorage.getItem("blockvote-identity");
    if (saved) {
      try {
        setIdentity(new Identity(saved));
      } catch (e) {
        console.error("Invalid saved identity");
      }
    }
  }, []);

  const joinGroup = async () => {
    if (!identity) return setMessage("No identity found");
    setLoading(true);
    try {
      const tx = await votingContract.joinGroup(identity.commitment);
      await tx.wait();
      setMessage("Registered on Blockchain!");
      loadGroup(votingContract);
    } catch (e) {
      console.error(e);
      setMessage("Registration failed (Check console)");
    }
    setLoading(false);
  };

  const voteForCandidate = async (id) => {
    if (!identity || !group) return setMessage("Not registered");
    if (hasVoted) return setMessage("Already voted");
    setLoading(true);
    try {
      // Refresh group to ensure Merkle Tree is up to date
      await loadGroup(votingContract);

      // Artificial delay to ensure state update
      await new Promise(r => setTimeout(r, 1000));

      const groupId = await votingContract.groupId();
      const proof = await generateProof(identity, group, BigInt(id), groupId, 20);
      const solidityProof = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points.map(p => BigInt(p))
      };

      const tx = await votingContract.anonymousVote(id, solidityProof, account);
      await tx.wait();
      setMessage("Vote Cast! +1 CPT Reward!");

      localStorage.setItem(`voted_${selectedElection}_${account}`, "true");
      setHasVoted(true);
      setActiveTab("results");
      loadCandidates(votingContract);
      // UPDATE CPT BALANCE
      fetchCPTBalance(factoryContract, signer, account);
    } catch (e) {
      console.error(e);
      if (e.reason && e.reason.includes("Semaphore")) setMessage("Double voting detected!");
      else setMessage("Voting failed");
    }
    setLoading(false);
  };

  const addCandidate = async (name) => {
    if (!name) return;
    setLoading(true);
    try {
      const tx = await votingContract.addCandidate(name);
      await tx.wait();
      setMessage("Candidate Added");
      loadCandidates(votingContract);
    } catch (e) { setMessage("Failed to add"); }
    setLoading(false);
  };

  // ==========================================
  // 🎨 UI COMPONENTS & DESIGN
  // ==========================================

  const Tooltip = ({ text, children }) => (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-gray-900/95 backdrop-blur text-xs text-gray-200 rounded-xl shadow-xl z-50 border border-gray-700 pointer-events-none">
        {text}
      </div>
    </div>
  );

  const InfoChip = ({ text }) => (
    <Tooltip text={text}>
      <Info size={14} className="text-gray-500 ml-2 cursor-help hover:text-blue-400" />
    </Tooltip>
  );

  const AboutModal = () => (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-gray-900 max-w-3xl w-full rounded-3xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-2xl font-bold text-white flex items-center"><Sparkles className="mr-2 text-yellow-400" size={20} /> How It Works</h2>
          <button onClick={() => setShowAboutModal(false)} className="text-gray-400 hover:text-white p-2 hover:bg-gray-700 rounded-full transition">✕</button>
        </div>

        {/* Modal Content */}
        <div className="p-8 overflow-y-auto space-y-6">
          <p className="text-gray-300 text-lg leading-relaxed">
            Welcome to the future. BlockVote+ isn't just a website; it's a <strong>decentralized application (DApp)</strong>. Here's why that matters:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 p-5 rounded-2xl border border-blue-500/20 hover:border-blue-500/50 transition">
              <h3 className="text-blue-400 font-bold mb-2 flex items-center"><Database size={16} className="mr-2" /> Diamond Ballot Box</h3>
              <p className="text-sm text-gray-400">
                Traditional databases are like paper notebooks—anyone with a pen (or admin access) can change the numbers. This app runs on the <strong>Blockchain</strong>. Once a vote is cast, it's etched in digital stone forever.
              </p>
            </div>

            <div className="bg-gray-800/50 p-5 rounded-2xl border border-purple-500/20 hover:border-purple-500/50 transition">
              <h3 className="text-purple-400 font-bold mb-2 flex items-center"><Ghost size={16} className="mr-2" /> The Digital Mask</h3>
              <p className="text-sm text-gray-400">
                How do we know it's you without knowing how you voted? We use <strong>Zero-Knowledge Proofs</strong>. It's like showing a bouncer your ticket to enter a club, but wearing a mask so they don't know exactly who you are.
              </p>
            </div>

            <div className="bg-gray-800/50 p-5 rounded-2xl border border-green-500/20 hover:border-green-500/50 transition">
              <h3 className="text-green-400 font-bold mb-2 flex items-center"><Award size={16} className="mr-2" /> Get Paid to Vote</h3>
              <p className="text-sm text-gray-400">
                Democracy should be rewarding. Every time you cast a valid vote, the smart contract automatically sends you <strong>1 CPT (Civic Participation Token)</strong>. Think of it as a digital "I Voted" sticker that lives in your wallet.
              </p>
            </div>

            <div className="bg-gray-800/50 p-5 rounded-2xl border border-gray-500/20 hover:border-gray-500/50 transition">
              <h3 className="text-gray-300 font-bold mb-2 flex items-center"><Lock size={16} className="mr-2" /> No Passwords</h3>
              <p className="text-sm text-gray-400">
                Forget "Forgot Password". Your login is your <strong>MetaMask Wallet</strong>. You possess the keys to your identity, not us.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // 📺 VIEWS
  // ==========================================

  if (view === "landing") {
    return (
      <div className="h-screen w-screen bg-[#0a0a0c] text-white flex flex-col relative overflow-hidden font-sans selection:bg-blue-500/30">

        {/* Navbar */}
        <div className="px-6 py-4 flex justify-between items-center z-20">
          <div className="flex items-center space-x-2 text-blue-500 font-bold text-lg tracking-tight">
            <ShieldCheck /> <span>BlockVote+</span>
          </div>
          <button onClick={() => setShowAboutModal(true)} className="flex items-center space-x-2 text-gray-400 hover:text-white transition bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm text-sm">
            <HelpCircle size={16} /> <span>How does this work?</span>
          </button>
        </div>

        {/* Hero Content - Compact & Centered */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 text-center relative">

          {/* Subtle Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>

          <div className="mb-4 inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
            <Sparkles size={10} /> <span>Web3 Voting Platform</span>
          </div>

          {/* Compact Headline: Single Line */}
          <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tight">
            Secure. Anonymous. <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Rewarding.</span>
          </h1>

          <p className="text-gray-400 text-sm md:text-base max-w-xl mb-8 leading-relaxed">
            The next generation of digital democracy. Cast your vote using Zero-Knowledge proofs and earn crypto rewards instantly.
          </p>

          {/* Compact Action Cards */}
          <div className="flex flex-row gap-4 w-full max-w-3xl px-4 h-48">

            {/* VOTER CARD */}
            <button
              onClick={() => { if (!account) connectWallet(); setView("lobby"); }}
              className="flex-1 group relative bg-gray-900/40 border border-white/10 p-6 rounded-2xl hover:border-blue-500/50 hover:bg-gray-900/60 transition-all duration-300 text-left overflow-hidden backdrop-blur-sm flex flex-col justify-center"
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <ArrowRight className="text-blue-500" size={24} />
              </div>
              <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <User size={20} />
              </div>
              <h3 className="text-lg font-bold mb-1 text-white group-hover:text-blue-400 transition-colors">I am a Voter</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Verify identity securely without revealing secrets, and cast your anonymous vote.
              </p>
            </button>

            {/* ORGANIZER CARD */}
            <button
              onClick={() => { if (!account) connectWallet(); setView("lobby"); setShowCreateModal(true); }}
              className="flex-1 group relative bg-gray-900/40 border border-white/10 p-6 rounded-2xl hover:border-purple-500/50 hover:bg-gray-900/60 transition-all duration-300 text-left overflow-hidden backdrop-blur-sm flex flex-col justify-center"
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Plus className="text-purple-500" size={24} />
              </div>
              <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Zap size={20} />
              </div>
              <h3 className="text-lg font-bold mb-1 text-white group-hover:text-purple-400 transition-colors">Create Election</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Deploy a new smart contract for your organization. You control the candidates.
              </p>
            </button>

          </div>
        </div>

        {/* Decorative Blobs */}
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[100px]"></div>
        </div>

        {showAboutModal && <AboutModal />}
      </div>
    );
  }

  // --- COMMON HEADER ---
  const Header = () => (
    <header className="h-16 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-30 sticky top-0">
      <div className="flex items-center space-x-6">
        <div onClick={() => setView("landing")} className="flex items-center space-x-2 text-blue-500 font-bold cursor-pointer hover:opacity-80 transition text-lg">
          <ShieldCheck /> <span>BlockVote+</span>
        </div>
        <div className="h-6 w-px bg-white/10"></div>
        <h2 className="text-gray-300 font-medium tracking-wide">
          {view === "lobby" ? "Election Lobby" : electionTitle}
        </h2>
      </div>

      <div className="flex items-center space-x-6">
        {/* CPT Display */}
        <Tooltip text="Your Civic Participation Tokens. Earned by voting.">
          <div className="flex items-center space-x-2 bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-xl border border-yellow-500/20 cursor-help hover:bg-yellow-500/20 transition">
            <Award size={18} />
            <span className="font-bold font-mono">{cptBalance} CPT</span>
          </div>
        </Tooltip>

        {/* Wallet Display */}
        {!account ? (
          <button onClick={connectWallet} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition shadow-lg shadow-blue-600/20">Connect Wallet</button>
        ) : (
          <Tooltip text="Logged in via MetaMask">
            <div className="flex items-center space-x-3 bg-gray-800/50 px-4 py-2 rounded-xl border border-white/10 text-sm font-mono text-gray-300 cursor-default">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
              {account.substring(0, 6)}...{account.substring(account.length - 4)}
            </div>
          </Tooltip>
        )}
      </div>
    </header>
  );

  // --- LOBBY VIEW ---
  if (view === "lobby") {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white font-sans">
        <Header />
        <main className="max-w-6xl mx-auto p-8">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-3xl font-bold mb-2">Active Elections</h2>
              <p className="text-gray-400">Select an election card to enter the dashboard.</p>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-blue-600/20 transition">
              <Plus size={18} className="mr-2" /> New Election
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {elections.map((ele, i) => (
              <div key={i} onClick={() => enterElection(ele.address, ele.title)} className="group bg-gray-900/50 border border-white/5 hover:border-blue-500/50 p-6 rounded-3xl cursor-pointer transition-all hover:bg-gray-800 relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <Vote size={24} />
                  </div>
                  <div className="p-2 bg-gray-800 rounded-full group-hover:bg-blue-500/20 group-hover:text-blue-400 transition">
                    <ArrowRight size={16} className="text-gray-600 group-hover:text-blue-400" />
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2 text-white">{ele.title}</h3>
                <p className="text-xs text-gray-500 font-mono bg-black/30 inline-block px-2 py-1 rounded">{ele.address.substring(0, 10)}...</p>
              </div>
            ))}
          </div>

          {showCreateModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-gray-900 p-8 rounded-3xl max-w-md w-full border border-gray-700 shadow-2xl">
                <h3 className="text-xl font-bold mb-2">Deploy New Election</h3>
                <p className="text-sm text-gray-400 mb-6">This will deploy a new Smart Contract. You will be the owner.</p>
                <input
                  className="w-full bg-black border border-gray-700 rounded-xl p-4 mb-6 text-white focus:border-blue-500 outline-none transition"
                  placeholder="Election Title (e.g. Class Rep)"
                  value={newElectionTitle}
                  onChange={(e) => setNewElectionTitle(e.target.value)}
                />
                <div className="flex space-x-3">
                  <button onClick={() => setShowCreateModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl font-bold transition">Cancel</button>
                  <button onClick={createElection} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold transition disabled:opacity-50">
                    {loading ? "Deploying..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <div className="h-screen bg-[#0a0a0c] text-white font-sans flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-[#0d0d10] border-r border-white/5 p-6 flex flex-col z-20">
          <button onClick={() => setView("lobby")} className="flex items-center space-x-3 text-gray-500 hover:text-white mb-10 transition group">
            <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-gray-700"><ArrowRight className="rotate-180" size={16} /></div>
            <span className="font-bold text-sm">Back to Lobby</span>
          </button>

          <nav className="space-y-2 flex-1">
            <button onClick={() => setActiveTab('home')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium ${activeTab === 'home' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800/50'}`}>
              <Home size={20} /> <span>Overview</span>
            </button>
            <button onClick={() => setActiveTab('register')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium ${activeTab === 'register' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800/50'}`}>
              <UserPlus size={20} /> <span>Registration</span>
            </button>
            <button onClick={() => setActiveTab('vote')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium ${activeTab === 'vote' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800/50'}`}>
              <Vote size={20} /> <span>Voting Booth</span>
            </button>
            <button onClick={() => setActiveTab('results')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium ${activeTab === 'results' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-gray-400 hover:bg-gray-800/50'}`}>
              <BarChart3 size={20} /> <span>Results</span>
            </button>
            {isOrganizer && (
              <div className="pt-6 mt-2">
                <p className="px-4 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Organizer</p>
                <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium ${activeTab === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-gray-400 hover:bg-gray-800/50'}`}>
                  <Settings size={20} /> <span>Admin Panel</span>
                </button>
              </div>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-10 relative bg-[#0a0a0c]">
          {message && (
            <div className="absolute top-6 right-8 bg-blue-600/90 backdrop-blur px-6 py-4 rounded-2xl shadow-xl z-50 flex items-center animate-in slide-in-from-top-5">
              <AlertCircle className="mr-3" /> <span className="font-medium">{message}</span>
              <button onClick={() => setMessage("")} className="ml-4 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}

          {activeTab === 'home' && (
            <div className="max-w-4xl animate-in fade-in duration-500">
              <h2 className="text-3xl font-bold mb-8">Election Overview</h2>
              <div className="grid grid-cols-3 gap-6 mb-10">
                <div className="bg-gray-900/50 p-6 rounded-3xl border border-white/5">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Status</p>
                  <p className="text-2xl font-bold text-green-400 flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-3 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span> Active</p>
                </div>
                <div className="bg-gray-900/50 p-6 rounded-3xl border border-white/5">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center">Candidates <InfoChip text="People running for this election." /></p>
                  <p className="text-2xl font-bold text-white">{candidates.length}</p>
                </div>
                <div className="bg-gray-900/50 p-6 rounded-3xl border border-white/5">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2 flex items-center">Voters <InfoChip text="Users who have committed their identity." /></p>
                  <p className="text-2xl font-bold text-white">{group ? group.members.length : 0}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 p-8 rounded-3xl border border-blue-500/20 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2">Ready to participate?</h3>
                  <p className="text-gray-400">Follow the steps to cast your secure, anonymous vote.</p>
                </div>
                <button onClick={() => setActiveTab('register')} className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl font-bold transition shadow-lg shadow-blue-600/20">Start Process</button>
              </div>
            </div>
          )}

          {activeTab === 'register' && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
              {/* Step 1 */}
              <div className={`p-8 rounded-3xl border transition-all duration-300 ${identity ? 'bg-gray-900/80 border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.05)]' : 'bg-gray-900/40 border-white/5'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Step 01</div>
                    <h3 className="text-2xl font-bold flex items-center">Generate Identity <InfoChip text="Creates a 'Trapdoor' and 'Nullifier' locally." /></h3>
                  </div>
                  {identity && <div className="bg-green-500/20 text-green-500 p-2 rounded-full"><CheckCircle size={24} /></div>}
                </div>

                {identity ? (
                  <div className="bg-black/50 p-4 rounded-xl border border-white/10 font-mono text-xs text-gray-400 break-all">
                    <span className="block text-gray-600 mb-2">// Your Public Commitment</span>
                    {identity.commitment.toString()}
                  </div>
                ) : (
                  <>
                    <p className="text-gray-400 mb-6">Create a cryptographic secret on your device. This ensures your vote cannot be traced back to your wallet.</p>
                    <button onClick={createIdentity} className="w-full bg-purple-600 hover:bg-purple-700 py-4 rounded-xl font-bold transition shadow-lg shadow-purple-600/20">Generate Secret Key</button>
                  </>
                )}
              </div>

              {/* Step 2 */}
              <div className={`p-8 rounded-3xl border transition-all duration-300 ${!identity ? 'opacity-40 grayscale' : 'bg-gray-900/40 border-white/5'}`}>
                <div className="mb-6">
                  <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Step 02</div>
                  <h3 className="text-2xl font-bold mb-2 flex items-center">Join Voter Group <InfoChip text="Sends your Public Commitment to the Smart Contract." /></h3>
                  <p className="text-gray-400">Submit your identity to the blockchain whitelist.</p>
                </div>
                <button onClick={joinGroup} disabled={!identity || loading} className="w-full bg-green-600 hover:bg-green-700 py-4 rounded-xl font-bold disabled:opacity-50 transition shadow-lg shadow-green-600/20">
                  {loading ? "Registering..." : "Register on Blockchain"}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'vote' && (
            <div className="animate-in fade-in duration-500">
              {hasVoted ? (
                <div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-white/5">
                  <div className="w-24 h-24 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_30px_rgba(34,197,94,0.2)]"><CheckCircle size={48} /></div>
                  <h2 className="text-4xl font-bold mb-4">Vote Recorded!</h2>
                  <p className="text-gray-400 mb-8 text-lg">Your anonymity is preserved. <br />You have earned <span className="text-yellow-400 font-bold">1 CPT</span>.</p>
                  <button onClick={() => setActiveTab('results')} className="bg-gray-800 hover:bg-gray-700 px-8 py-3 rounded-xl font-bold transition">View Live Results</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {candidates.map(c => (
                    <div key={c.id} className="group bg-gray-900/50 border border-white/5 p-8 rounded-3xl hover:border-blue-500/50 transition-all duration-300 relative hover:-translate-y-1">
                      <div className="w-16 h-16 bg-gray-800 rounded-2xl mb-6 flex items-center justify-center text-3xl group-hover:bg-blue-600/20 transition">👤</div>
                      <h3 className="text-2xl font-bold mb-2">{c.name}</h3>
                      <p className="text-sm text-gray-500 mb-8">Candidate #{c.id}</p>
                      <button onClick={() => voteForCandidate(c.id)} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-xl font-bold disabled:opacity-50 transition shadow-lg shadow-blue-600/20">
                        Vote
                      </button>
                    </div>
                  ))}
                  {candidates.length === 0 && <div className="col-span-full text-center py-20 text-gray-500">No candidates available.</div>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <div className="h-[500px] bg-gray-900/50 p-8 rounded-3xl border border-white/5 shadow-2xl animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold">Live Blockchain Results</h3>
                <div className="text-xs font-mono text-green-400 bg-green-500/10 px-3 py-1 rounded-full flex items-center"><div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-2 animate-pulse"></div> REAL-TIME</div>
              </div>

              {candidates.length > 0 ? (
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={candidates}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis dataKey="name" stroke="#6b7280" axisLine={false} tickLine={false} dy={10} />
                    <YAxis stroke="#6b7280" allowDecimals={false} axisLine={false} tickLine={false} />
                    <RechartsTooltip cursor={{ fill: '#1f2937', opacity: 0.4 }} contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
                    <Bar dataKey="voteCount" radius={[8, 8, 0, 0]}>
                      {candidates.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B'][index % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-500 text-center mt-32">No voting data yet.</p>}
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="max-w-2xl mx-auto bg-gray-900/50 border border-red-500/20 p-10 rounded-3xl animate-in fade-in duration-500">
              <h3 className="text-2xl font-bold text-white mb-2 flex items-center"><Settings className="mr-3 text-red-500" /> Admin Panel</h3>
              <p className="text-gray-400 mb-8">Manage your election candidates.</p>

              <div className="flex gap-4 mb-4">
                <input id="candInput" className="flex-1 bg-black border border-gray-700 rounded-xl p-4 text-white focus:border-red-500 outline-none transition" placeholder="Candidate Name" />
                <button onClick={() => {
                  addCandidate(document.getElementById('candInput').value);
                  document.getElementById('candInput').value = "";
                }} className="bg-red-600 hover:bg-red-700 px-8 rounded-xl font-bold shadow-lg shadow-red-600/20 transition">Add</button>
              </div>
              <p className="text-xs text-gray-500 bg-red-900/10 p-4 rounded-xl border border-red-500/10">
                ⚠️ Security Note: Only the wallet that deployed this contract (Owner) can execute these transactions.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;