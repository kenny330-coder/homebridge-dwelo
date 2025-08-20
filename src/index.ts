import { API } from 'homebridge';

import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, HomebridgePluginDweloPlatform);
};