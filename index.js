import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import { AuthProvider } from './src/context/AuthContext';

// AuthProvider wraps the whole app so any screen can call useAuth() to read
// the signed-in user or trigger Google Sign-In — App.js stays local-first by
// default and only talks to the cloud once `user` is set.
function Root() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
