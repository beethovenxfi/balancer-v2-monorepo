import { fp } from '@balancer-labs/v2-helpers/src/numbers';
import { BigNumber } from 'ethers';
import { optimismTokens } from '../optimismTokens';
import { createWeightedPool } from '../../../src/createWeightedPool';
import { toNormalizedWeights } from '@balancer-labs/balancer-js/src';

export default async function (etherscanApiKey: string): Promise<void> {
  await createWeightedPool({
    name: 'Test pool2',
    symbol: 'TEST-WEIGHTED2',
    //the tokens here must be sorted by address. if you get an error code 101, your tokens are not sorted in the correct order
    tokens: [optimismTokens.USDC.address, optimismTokens.USDT.address],
    weights: toNormalizedWeights([fp(50), fp(50)]),
    initialBalances: [BigNumber.from(1e6) ,BigNumber.from(1e6)],
    swapFeePercentage: fp(0.0025),
    etherscanApiKey,
  });
}
