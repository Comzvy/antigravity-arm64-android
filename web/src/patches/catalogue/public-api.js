/**
 * patches/catalogue/public-api.js - Public API for opening the Skills & Plugins Catalogue.
 */

window.__agCatalogue = {
  __installed: true,
  openModal: openCatalogueModal,
  closeModal: closeCatalogueModal,
  PLUGINS: CATALOGUE_PLUGINS,
  SKILLS: CATALOGUE_SKILLS
};

window.__agOpenCatalogueModal = openCatalogueModal;
