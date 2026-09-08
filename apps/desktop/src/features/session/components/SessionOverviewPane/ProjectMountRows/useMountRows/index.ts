import { useMemo } from 'react';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../../store';
import {
  buildMountRows,
  type MountProjectGroup,
} from '../../../../../../store/slices/project-mounts/mountRowModel';

type Params = {
  readonly sessionId: SessionId;
};

export const useMountRows = ({ sessionId }: Params): ReadonlyArray<MountProjectGroup> => {
  const projects = useAppStore((state) => state.projects);
  const views = useAppStore((state) => state.sessionMounts[sessionId]);
  const projectMounts = useAppStore((state) => state.sessionProjectMounts[sessionId]);
  const mountGithub = useAppStore((state) => state.mountGithub);
  const mountGitlabMr = useAppStore((state) => state.mountGitlabMr);
  const mountBitbucketPr = useAppStore((state) => state.mountBitbucketPr);
  const observations = useAppStore((state) => state.mountBranchObservations[sessionId]);
  const prSeries = useAppStore((state) => state.prSeries[sessionId]);

  return useMemo(
    () =>
      buildMountRows({
        sessionId,
        state: {
          projects,
          sessionMounts: views === undefined ? {} : { [sessionId]: views },
          sessionProjectMounts: projectMounts === undefined ? {} : { [sessionId]: projectMounts },
          mountGithub,
          mountGitlabMr,
          mountBitbucketPr,
          mountBranchObservations: observations === undefined ? {} : { [sessionId]: observations },
          prSeries: prSeries === undefined ? {} : { [sessionId]: prSeries },
        },
      }),
    [
      mountBitbucketPr,
      mountGithub,
      mountGitlabMr,
      observations,
      prSeries,
      projectMounts,
      projects,
      sessionId,
      views,
    ],
  );
};
