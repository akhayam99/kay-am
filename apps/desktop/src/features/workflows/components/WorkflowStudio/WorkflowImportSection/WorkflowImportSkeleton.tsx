import { Skeleton } from '@goodboy/ui';

export const WorkflowImportSkeleton = () => (
  <div role="status" aria-label="Loading workflows" className="flex flex-col gap-1">
    <Skeleton className="h-3 w-16 rounded" />
    <Skeleton className="h-7 w-full rounded-md" />
  </div>
);
