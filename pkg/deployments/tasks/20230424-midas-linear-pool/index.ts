import { bn } from '@balancer-labs/v2-helpers/src/numbers';
import Task, { TaskMode } from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { MidasLinearPoolDeployment } from './input';
import { ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { ethers } from 'hardhat';
import { getContractDeploymentTransactionHash, saveContractDeploymentTransactionHash } from '../../src';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as MidasLinearPoolDeployment;
  const args = [
    input.Vault,
    input.ProtocolFeePercentagesProvider,
    input.BalancerQueries,
    input.FactoryVersion,
    input.PoolVersion,
    input.InitialPauseWindowDuration,
    input.BufferPeriodDuration,
  ];

  await task.deployAndVerify('MidasLinearPoolFactory', args, from, force);
};
