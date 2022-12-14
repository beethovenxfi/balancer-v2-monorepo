import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { ReaperLinearPoolDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as ReaperLinearPoolDeployment;
  const args = [input.Vault, input.ProtocolFeePercentagesProvider, input.BalancerQueries];

  await task.deployAndVerify('ReaperLinearPoolFactory', args, from, force);
};
