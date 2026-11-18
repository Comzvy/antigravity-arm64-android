/**
 * patches/ai_models_menu/public-api.js - Public API for opening the AI Models & API Key menu.
 */

window.__agAiModels = {
  __installed: true,
  openModal: openAiModelsModal,
  closeModal: closeAiModelsModal,
  getConfig: loadAiConfig,
  saveConfig: saveAiConfigToBridge
};

window.__agOpenAiModelsModal = openAiModelsModal;
