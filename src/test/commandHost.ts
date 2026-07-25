// ============================================================================
// TEST COMMAND HOST
//
// A command service wired to a real reducer, a fake repository, and scripted
// answers for every question the commands can ask the user.
// ============================================================================

import { vi } from 'vitest';
import type { AppAction, AppState, Drill } from '@/core/types';
import { appReducer, createInitialState } from '@/core/state';
import { SaveCoordinator } from '@/persistence';
import { CameraStore } from '@/camera/CameraStore';
import { PlaybackStore } from '@/playback/PlaybackStore';
import {
  createDrillCommandService,
  type CommandHost,
  type ConfirmationRequest,
  type DrillCommandService,
  type ToastInput,
} from '@/commands';
import { FakeRepository } from './fakeRepository';
import { FIXED_NOW } from './builders';

export interface TestHarness {
  commands: DrillCommandService;
  repository: FakeRepository;
  coordinator: SaveCoordinator;
  camera: CameraStore;
  playback: PlaybackStore;
  /** Every action the commands dispatched, in order. */
  readonly actions: AppAction[];
  /** Every toast the commands raised. */
  readonly toasts: ToastInput[];
  /** Every confirmation the commands asked for. */
  readonly confirmations: ConfirmationRequest[];
  /** Every file the commands tried to download. */
  readonly downloads: { filename: string; contents: string }[];
  readonly announcements: string[];
  /** How the next confirmation is answered. */
  answerConfirm(value: boolean): void;
  /** How the next text prompt is answered; null cancels. */
  answerPrompt(value: string | null): void;
  /** How the next unsaved-export decision is answered. */
  answerUnsavedExport(value: 'export-anyway' | 'cancel'): void;
  /** Make downloads report failure. */
  breakDownloads(): void;
  getState(): AppState;
  setState(next: AppState): void;
  dispatch(action: AppAction): void;
  /** Replace the whole drill, as a fixture would. */
  loadDrill(drill: Drill): void;
}

export function createTestHarness(initial?: Partial<AppState>): TestHarness {
  let state: AppState = { ...createInitialState(), ...initial };

  const actions: AppAction[] = [];
  const toasts: ToastInput[] = [];
  const confirmations: ConfirmationRequest[] = [];
  const downloads: { filename: string; contents: string }[] = [];
  const announcements: string[] = [];

  let confirmAnswer = true;
  let promptAnswer: string | null = 'Prompted Name';
  let unsavedExportAnswer: 'export-anyway' | 'cancel' = 'cancel';
  let downloadsWork = true;

  const repository = new FakeRepository();
  const coordinator = new SaveCoordinator(repository);
  const camera = new CameraStore();
  const playback = new PlaybackStore();

  const dispatch = (action: AppAction) => {
    actions.push(action);
    state = appReducer(state, action);
  };

  const host: CommandHost = {
    getState: () => state,
    dispatch,
    repository,
    coordinator,
    camera,
    playback,
    notify: {
      toast: input => toasts.push(input),
      dismiss: vi.fn(),
    },
    confirm: async request => {
      confirmations.push(request);
      return confirmAnswer;
    },
    promptForText: async () => promptAnswer,
    confirmUnsavedExport: async () => unsavedExportAnswer,
    download: (filename, contents) => {
      if (!downloadsWork) return false;
      downloads.push({ filename, contents });
      return true;
    },
    announce: message => announcements.push(message),
    publishImportPreview: vi.fn(),
    now: () => FIXED_NOW,
  };

  return {
    commands: createDrillCommandService(host),
    repository,
    coordinator,
    camera,
    playback,
    actions,
    toasts,
    confirmations,
    downloads,
    announcements,
    answerConfirm: value => {
      confirmAnswer = value;
    },
    answerPrompt: value => {
      promptAnswer = value;
    },
    answerUnsavedExport: value => {
      unsavedExportAnswer = value;
    },
    breakDownloads: () => {
      downloadsWork = false;
    },
    getState: () => state,
    setState: next => {
      state = next;
    },
    dispatch,
    loadDrill: drill => {
      state = { ...state, drill, currentDrillId: drill.id };
    },
  };
}

/** The last toast raised, for asserting on user-facing wording. */
export function lastToast(harness: TestHarness): ToastInput | undefined {
  return harness.toasts[harness.toasts.length - 1];
}

/** Whether any toast contained `fragment`. */
export function toasted(harness: TestHarness, fragment: string | RegExp): boolean {
  return harness.toasts.some(toast =>
    typeof fragment === 'string' ? toast.message.includes(fragment) : fragment.test(toast.message)
  );
}
