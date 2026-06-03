// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {BaseBlastLeaderboard} from "../src/BaseBlastLeaderboard.sol";

/// @notice Deploy the leaderboard. Reads from env:
///   DEPLOYER_PRIVATE_KEY — deployer (becomes owner)
///   SIGNER_ADDRESS       — trusted verifier signer
///
/// Base Sepolia:
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
/// Base mainnet (same command, different network):
///   forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address signer = vm.envAddress("SIGNER_ADDRESS");
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);
        BaseBlastLeaderboard lb = new BaseBlastLeaderboard(owner, signer);
        vm.stopBroadcast();

        console.log("BaseBlastLeaderboard:", address(lb));
        console.log("Owner:", owner);
        console.log("Trusted signer:", signer);
    }
}
