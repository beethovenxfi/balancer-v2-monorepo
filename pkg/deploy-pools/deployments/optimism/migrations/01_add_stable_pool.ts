import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { BigNumber } from 'ethers';
import { optimismTokens } from '../optimismTokens';
import { createStablePool } from '../../../src/createStablePool'

export default async function (etherscanApiKey: string): Promise<void> {
  console.log("let's go")
  await createStablePool({
    name: 'StableFactoryV2',
    symbol: 'BPTs-FACv2',
    //the tokens here must be sorted by address. if you get an error code 101, your tokens are not sorted in the correct order
    tokens: [optimismTokens.USDT.address, optimismTokens.DAI.address],
    amplificationParameter: 1000,
    initialBalances: [BigNumber.from(1e6), fp(1)],
    swapFeePercentage: fp(0.0004),
    owner: "0xd9e2889AC8C6fFF8e94c7c1bEEAde1352dF1A513",
    etherscanApiKey,
  });

  // await createStablePool({
  //   name: 'Optimistic Steady Beets',
  //   symbol: 'BPT-OPSTEADY',
  //   //the tokens here must be sorted by address. if you get an error code 101, your tokens are not sorted in the correct order
  //   tokens: [optimismTokens.USDC.address, optimismTokens.USDT.address, optimismTokens.DAI.address],
  //   amplificationParameter: 1000,
  //   initialBalances: [BigNumber.from(5e6), BigNumber.from(5e6), fp(5)],
  //   swapFeePercentage: fp(0.0004),
  //   owner: "0xd9e2889AC8C6fFF8e94c7c1bEEAde1352dF1A513",
  //   etherscanApiKey,
  // });

  // await createStablePool({
  //   name: 'Qi Dynasty',
  //   symbol: 'BPT-QIDYN',
  //   //the tokens here must be sorted by address. if you get an error code 101, your tokens are not sorted in the correct order
  //   tokens: [optimismTokens.USDC.address, optimismTokens.USDT.address, optimismTokens.DAI.address, optimismTokens.MAI.address],
  //   amplificationParameter: 500,
  //   initialBalances: [BigNumber.from(5e6), BigNumber.from(5e6), fp(5), fp(5)],
  //   swapFeePercentage: fp(0.0004),
  //   owner: "0xd9e2889AC8C6fFF8e94c7c1bEEAde1352dF1A513",
  //   etherscanApiKey,
  // });
}
