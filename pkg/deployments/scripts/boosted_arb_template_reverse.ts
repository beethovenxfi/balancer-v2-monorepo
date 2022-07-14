// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ethers } from 'hardhat';
import { FundManagement, SingleSwap } from '@balancer-labs/balancer-js/src';
import { MAX_UINT256 } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumber } from 'ethers';
import VaultAbi from '../tasks/20210418-vault/abi/Vault.json';
import YearnVaultAbi from './abi/YearnVaultAbi.json';
import IERC20Abi from './abi/IERC20.json';
import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { getAddress } from '@ethersproject/address';

const USDC = getAddress('0x04068DA6C83AFCFA0e13ba15A6696662335D5B75');
const yvUSDC = getAddress('0xEF0210eB96c7EB36AF8ed1c20306462764935607');
const DAI = getAddress('0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E');
const yvDAI = getAddress('0x637eC617c86D24E421328e6CAEa1d92114892439');

const bbyvDAI = getAddress('0x2Ff1552Dd09f87d6774229Ee5eca60CF570AE291');
const bbyvDAIPoolId = '0x2ff1552dd09f87d6774229ee5eca60cf570ae291000000000000000000000186';
const bbyvUSDC = getAddress('0x3b998ba87b11a1c5bc1770de9793b17a0da61561');
const bbyvUSDCPoolId = '0x3b998ba87b11a1c5bc1770de9793b17a0da61561000000000000000000000185';

const bbyvUSDPoolId = '0x5ddb92a5340fd0ead3987d3661afcd6104c3b757000000000000000000000187';
const bbyvUSD = getAddress('0x5ddb92A5340FD0eaD3987D3661AfcD6104c3b757');

const sender = '0xa71c1e842f6D9eb0A30F41682943478C940d8852';

async function loop() {
  const vault = await ethers.getContractAt(VaultAbi, '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce');
  const yearnVault = await ethers.getContractAt(YearnVaultAbi, yvUSDC);
  const mainToken = await ethers.getContractAt(IERC20Abi, USDC);

  for (let i = 0; i < 30; i++) {
    const vaultTokenBalance = await yearnVault.balanceOf(sender);

    console.log('vault token balance', vaultTokenBalance.toString());

    const withdrawTransaction = await yearnVault.withdraw(vaultTokenBalance);
    const withdrawReceipt = await withdrawTransaction.wait();

    console.log('unwrap complete ' + i);

    const mainTokenBalance = await mainToken.balanceOf(sender);
    console.log('main token balance', mainTokenBalance.toString());

    const data: SingleSwap = {
      poolId: bbyvUSDCPoolId,
      kind: 0, //0 means the amount is givenIn. 1 is for giventOut
      assetIn: USDC,
      assetOut: yvUSDC,
      amount: mainTokenBalance,
      userData: '0x', //the user data here is not relevant on the swap
    };

    const funds: FundManagement = {
      sender,
      fromInternalBalance: false,
      toInternalBalance: false,
      recipient: sender,
    };

    const transaction = await vault.swap(data, funds, BigNumber.from(0), MAX_UINT256);
    const receipt = await transaction.wait();
    console.log('swap complete ' + i);
  }
}

loop().catch((e) => {
  console.log('error', e);
});
