import { API } from 'homebridge';

import { HomebridgePluginDweloPlatform } from './HomebridgePluginDweloPlatform';
import { PLATFORM_NAME } from './settings';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, HomebridgePluginDweloPlatform);
};