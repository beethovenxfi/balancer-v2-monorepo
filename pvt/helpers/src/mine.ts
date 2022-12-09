import { ethers, network } from 'hardhat';

export async function advanceBlock() {
  return ethers.provider.send('evm_mine', []);
}
export async function setAutomineBlocks(enabled: boolean) {
  return network.provider.send('evm_setAutomine', [enabled]);
}
