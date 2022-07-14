// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ethers } from 'hardhat';
import { FundManagement, SingleSwap } from '@balancer-labs/balancer-js/src';
import { MAX_UINT256 } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumber } from 'ethers';
import VaultAbi from '../tasks/20210418-vault/abi/Vault.json';
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

const bbyvFTM = getAddress('0xC3BF643799237588b7a6B407B3fc028Dd4e037d2');
const bbyvFTMPoolId = '0xc3bf643799237588b7a6b407b3fc028dd4e037d200000000000000000000022d';

const BOO = getAddress('0x841fad6eae12c286d1fd18d1d525dffa75c7effe');
const xBOO = getAddress('0xa48d959ae2e88f1daa7d5f611e01908106de7598');
const bbBOO = getAddress('0x71959b131426FdB7aF01DE8D7d4149CcAF09F8cc');
const bbBOOPoolId = '0x71959b131426fdb7af01de8d7d4149ccaf09f8cc0000000000000000000002e7';

const WBTC = getAddress('0x321162Cd933E2Be498Cd2267a90534A804051b11');
const yvWBTC = getAddress('0xd817A100AB8A29fE3DBd925c2EB489D67F758DA9');
const bbyvWBTC = getAddress('0x42538Ce99111ea34dc2987b141Bd6E9b594752D6');
const bbyvWBTCPoolId = '0x42538ce99111ea34dc2987b141bd6e9b594752d60000000000000000000002f9';

const WETH = getAddress('0x74b23882a30290451A17c44f4F05243b6b58C76d');
const yvWETH = getAddress('0xCe2Fc0bDc18BD6a4d9A725791A3DEe33F3a23BB7');
const bbyvWETH = getAddress('0x44165faD0b7eA0D54d8856765D936d7026f9E2f2');
const bbyvWETHPoolId = '0x44165fad0b7ea0d54d8856765d936d7026f9e2f20000000000000000000002f8';

const FTM = getAddress('0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83');
const yvFTM = getAddress('0x0DEC85e74A92c52b7F708c4B10207D9560CEFaf0');

const FRAX = '0xdc301622e621166BD8E82f2cA0A26c13Ad0BE355';
const yvFRAX = getAddress('0x357ca46da26E1EefC195287ce9D838A6D5023ef3');
const bbyvFRAX = getAddress('0x7cF76BCCfA5d3340D42F08351552f5a59dC6089C');
const bbyvFRAXPoolId = '0x7cf76bccfa5d3340d42f08351552f5a59dc6089c000000000000000000000396';

const fUSDT = getAddress('0x049d68029688eAbF473097a2fC38ef61633A3C7A');
const yvUSDT = getAddress('0x148c05caf1Bb09B5670f00D511718f733C54bC4c');
const bbyvfUSDT = '0xFE0004cA84bac1D9CF24a3270BF70Be7E68e43aC';
const bbyvfUSDTPoolId = '0xfe0004ca84bac1d9cf24a3270bf70be7e68e43ac0000000000000000000003c5';

const bbyvOldUst = getAddress('0x57793d39e8787ee6295f6a27a81b6cca68e85cdf');
const bbyvOldUstPoolId = '0x57793d39e8787ee6295f6a27a81b6cca68e85cdf000000000000000000000397';
const WORMHOLE_UST = getAddress('0x846e4D51d7E2043C1a87E0Ab7490B93FB940357b');

const bbyv4poolId = '0x6da14f5acd58dd5c8e486cfa1dc1c550f5c61c1c0000000000000000000003cf';
const bbyv4pool = getAddress('0x6Da14F5ACD58Dd5c8E486CFa1dC1c550F5c61C1c');

const bbyvDEIPoolId = '0xdfc65c1f15ad3507754ef0fd4ba67060c108db7e000000000000000000000406';
const bbyvDEI = getAddress('0xdfc65c1f15ad3507754ef0fd4ba67060c108db7e');
const DEI = getAddress('0xDE12c7959E1a72bbe8a5f7A1dc8f8EeF9Ab011B3');

const rfscTUSD = getAddress('0xbd81110596651c1b00b6a7d9d93e8831e227eae9');
const TUSD = getAddress('0x9879abdea01a879644185341f7af7d8343556b7a');
const rfTUSDPoolId = '0xb85a3fc39993b2e7e6874b8700b436c212a005160000000000000000000003d0';

async function swap() {
  const vault = await ethers.getContractAt(VaultAbi, '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce');

  //6,901.066037322872044353
  // amount: fp(3626.34489174875),
  const data: SingleSwap = {
    poolId: bbyv4poolId,
    kind: 0, //0 means the amount is givenIn. 1 is for giventOut
    assetIn: bbyv4pool,
    assetOut: WORMHOLE_UST,
    amount: fp(3144.90100985979),
    userData: '0x', //the user data here is not relevant on the swap
  };

  const funds: FundManagement = {
    sender: '0x4fbe899d37fb7514adf2f41B0630E018Ec275a0C',
    fromInternalBalance: false,
    toInternalBalance: false,
    recipient: '0x4fbe899d37fb7514adf2f41B0630E018Ec275a0C',
  };

  const transaction = await vault.swap(data, funds, BigNumber.from(0), MAX_UINT256);
  const receipt = await transaction.wait();

  console.log('receipt', receipt);
}

swap().catch((e) => {
  console.log('error', e);
});
