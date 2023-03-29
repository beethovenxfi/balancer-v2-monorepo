import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { PoolSpecificProtocolFeePercentagesProviderDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as PoolSpecificProtocolFeePercentagesProviderDeployment;

  const args = [input.Vault, input.maxYieldValue, input.maxAUMValue];
  await task.deployAndVerify('PoolSpecificProtocolFeePercentagesProvider', args, from, force);
};
