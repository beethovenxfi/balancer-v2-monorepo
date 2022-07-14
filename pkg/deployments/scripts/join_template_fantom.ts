// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ethers } from 'hardhat';
import { JoinPoolRequest } from '@balancer-labs/balancer-js/src';
import VaultAbi from '../tasks/20210418-vault/abi/Vault.json';
import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { getAddress } from '@ethersproject/address';

const JOIN_KIND_INIT = 0;

async function joinPool() {
  const vault = await ethers.getContractAt(VaultAbi, '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce');
  //because we use ExactTokensInForBPTOut, we don't set a minimumBPT. Instead we set the maxAmountsIn as the amountsIn
  const bbyvUSD = getAddress('0x5ddb92A5340FD0eaD3987D3661AfcD6104c3b757');
  const bbyvUSDC = getAddress('0x3b998ba87b11a1c5bc1770de9793b17a0da61561');
  const bbyvDAI = getAddress('0x2Ff1552Dd09f87d6774229Ee5eca60CF570AE291');
  const bbyvUSDTUSD = getAddress('0x31aDC46737eBb8E0E4A391ec6c26438BaDaEe8cA');
  const bbyvUSDTUSDPoolId = '0x31adc46737ebb8e0e4a391ec6c26438badaee8ca000000000000000000000306';
  const TUSD = getAddress('0x9879aBDea01a879644185341F7aF7d8343556B7a');

  const bptcLQDR = getAddress('0xEAdCFa1F34308b144E96FcD7A07145E027A8467d');
  const LQDR = getAddress('0x10b620b2dbac4faa7d7ffd71da486f5d44cd86f9');
  const cLQDR = getAddress('0x814c66594a22404e101FEcfECac1012D8d75C156');
  const bptcLQDRPoolId = '0xeadcfa1f34308b144e96fcd7a07145e027a8467d000000000000000000000331';
  const MOR = getAddress('0x22A6aC883B2f5007486C0D0EBC520747c0702Ad5');
  const bbyvMorUsd = getAddress('0xA55318E5d8B7584b8c0e5d3636545310Bf9eEb8f');
  const bbyvMorUsdPoolId = '0xa55318e5d8b7584b8c0e5d3636545310bf9eeb8f000000000000000000000337';

  const FRAX = '0xdc301622e621166BD8E82f2cA0A26c13Ad0BE355';
  const yvFRAX = getAddress('0x357ca46da26E1EefC195287ce9D838A6D5023ef3');
  const bbyvFRAX = getAddress('0x7cF76BCCfA5d3340D42F08351552f5a59dC6089C');
  const bbyvFraxUstUsd = getAddress('0x57793d39E8787EE6295f6a27A81B6CCA68E85cDF');
  const bbyvFraxUstUsdPoolId = '0x57793d39e8787ee6295f6a27a81b6cca68e85cdf000000000000000000000397';

  const bptSFTMx = '0xc0064b291bd3D4ba0E44ccFc81bF8E7f7a579cD2';
  const bptSFTMxPoolId = '0xc0064b291bd3d4ba0e44ccfc81bf8e7f7a579cd200000000000000000000042c';
  const bbyvFTM = '0xC3BF643799237588b7a6B407B3fc028Dd4e037d2';
  const sFTMx = '0xd7028092c830b5C8FcE061Af2E593413EbbC1fc1';
  //0xc0064b291bd3D4ba0E44ccFc81bF8E7f7a579cD2,0xC3BF643799237588b7a6B407B3fc028Dd4e037d2,0xd7028092c830b5C8FcE061Af2E593413EbbC1fc1

  const WORMHOLE_UST = getAddress('0x846e4D51d7E2043C1a87E0Ab7490B93FB940357b');

  const bbyvfUSDT = getAddress('0xFE0004cA84bac1D9CF24a3270BF70Be7E68e43aC');
  const bbyv4poolId = '0x6da14f5acd58dd5c8e486cfa1dc1c550f5c61c1c0000000000000000000003cf';
  const bbyv4pool = getAddress('0x6Da14F5ACD58Dd5c8E486CFa1dC1c550F5c61C1c');

  const abiCoder = new ethers.utils.AbiCoder();
  const assets = [bptSFTMx, bbyvFTM, sFTMx];
  //const amountsIn = [fp(10), fp(10_000_000_000_000_000), fp(10), 10_000_000, fp(10)];
  const amountsIn = [fp(10_000_000_000_000_000), fp(10), fp(10)];
  //const userData = abiCoder.encode(['uint256', 'uint256[]'], [JOIN_KIND_INIT, amountsIn]);
  const userData = abiCoder.encode(['uint256', 'uint256[]'], [1, amountsIn]);

  const data: JoinPoolRequest = {
    assets,
    //we set maxAmountsIn here because our kind is ExactTokensInForBPTOut
    maxAmountsIn: amountsIn,
    userData,
    fromInternalBalance: false,
  };
  const transaction = await vault.joinPool(
    bptSFTMxPoolId,
    '0x4fbe899d37fb7514adf2f41B0630E018Ec275a0C',
    '0x4fbe899d37fb7514adf2f41B0630E018Ec275a0C',
    data
  );
  const receipt = await transaction.wait();

  console.log('receipt', receipt);
}

joinPool().catch((e) => {
  console.log('error', e);
});
