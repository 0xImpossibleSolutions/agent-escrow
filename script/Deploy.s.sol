// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/AgentEscrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address feeCollector = vm.envAddress("FEE_COLLECTOR");
        
        vm.startBroadcast(deployerPrivateKey);
        
        AgentEscrow escrow = new AgentEscrow(feeCollector);
        
        vm.stopBroadcast();
        
        console.log("AgentEscrow deployed at:", address(escrow));
        console.log("Fee collector:", feeCollector);
    }
}
