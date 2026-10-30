/** Browser calls are a closed subset of Console IPC, never arbitrary IPC. */
export const WEB_CONSOLE_METHODS = {
  getSnapshot: 'console:get-snapshot', getOverview: 'console:get-overview', getEvents: 'console:get-events',
  getConfig: 'console:get-config', getModels: 'console:get-models', saveModelDraft: 'console:save-model-draft',
  saveDraft: 'console:save-draft', testDraft: 'console:test-draft', publish: 'console:publish', rollback: 'console:rollback',
  loadAvatar: 'console:load-avatar', deleteAvatar: 'console:delete-avatar',
  listAvatarModels: 'console:list-avatar-models', saveAvatarModelLabel: 'console:save-avatar-model-label',
  createNextRuntimeSnapshots: 'console:create-next-runtime', getPhaseTests: 'console:get-phase-tests',
  getAvatarRuntime: 'console:get-avatar-runtime', controlAvatar: 'console:avatar-control',
  startConversation: 'console:start-conversation', disconnect: 'console:disconnect', interrupt: 'console:interrupt',
  runScene: 'console:run-scene', stopScenes: 'console:stop-scenes', studio: 'console:studio',
  loopVideo: 'console:loop-video', danceFloor: 'console:dance-floor', checkCamera: 'console:check-camera', mediaFolders: 'console:media-folders',
} as const
export type WebConsoleMethod = keyof typeof WEB_CONSOLE_METHODS
export const WEB_CONSOLE_LOCAL_ONLY = 'Use Console on the Mac for file imports, private memory, voice preview, wake calibration and simulator controls.'
