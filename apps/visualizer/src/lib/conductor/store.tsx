'use client';

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import {
  conductorReducer,
  createDefaultProject,
  loadProject,
  saveProject,
  type ConductorAction,
  type ConductorProject,
} from './project';

interface ConductorContextValue {
  project: ConductorProject;
  dispatch: Dispatch<ConductorAction>;
}

const ConductorContext = createContext<ConductorContextValue | null>(null);

function initProject(): ConductorProject {
  return loadProject() ?? createDefaultProject();
}

export function ConductorProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducer(conductorReducer, undefined, initProject);

  // Persist on every change (the project JSON is tiny).
  useEffect(() => {
    saveProject(project);
  }, [project]);

  return <ConductorContext.Provider value={{ project, dispatch }}>{children}</ConductorContext.Provider>;
}

export function useConductor(): ConductorContextValue {
  const ctx = useContext(ConductorContext);
  if (!ctx) throw new Error('useConductor must be used within a ConductorProvider');
  return ctx;
}
