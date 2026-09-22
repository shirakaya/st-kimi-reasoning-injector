// SillyTavern accepts one JavaScript entry in an extension manifest.
// Keep upstream and the local settings-profile feature in separate modules,
// but load them in a deterministic order through this single entry point.
import './index.js';
import './settings-profiles.js';
