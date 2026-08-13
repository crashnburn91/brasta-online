(() => {
  if (window.BrastaRules) return;
  window.BrastaRules = {
    applyCommand(state, command) {
      const result = Brasta.applyCommand(state, command);
      return postProcessBrastaRules(state, command, result);
    }
  };
})();
