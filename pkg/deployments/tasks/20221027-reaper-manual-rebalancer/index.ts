import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { ReaperManualRebalancerDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as ReaperManualRebalancerDeployment;
  const args = [input.Vault];

  await task.deployAndVerify('ReaperManualRebalancer', args, from, force);
};
