import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { BooLinearPoolDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as BooLinearPoolDeployment;

  const args = [input.Vault, input.ProtocolFeePercentagesProvider, input.BalancerQueries];
  await task.deployAndVerify('BooLinearPoolFactory', args, from, force);
};
