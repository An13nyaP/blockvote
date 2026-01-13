const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);

    console.log("----------------------------------------------------");
    console.log("Deploying with account:", deployer.address);
    console.log("Account Balance:", hre.ethers.formatEther(balance), "ETH");
    console.log("----------------------------------------------------");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});