import React from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import { AuthProvider } from './src/context/AuthContext';

// AuthProvider wraps the whole app so any screen can call useAuth() to read
// the signed-in user or trigger Google Sign-In — App.js stays local-first by
// default and only talks to the cloud once `user` is set.
//
// SafeAreaProvider MUST sit above every <SafeAreaView> / useSafeAreaInsets()
// call in the tree (App.js has several). Without it, react-native-safe-area-
// context has no native inset measurements to hand out and silently falls
// back to zero — which is what was letting the bottom tab bar render under
// the Android gesture bar / home indicator on some devices, especially with
// edgeToEdgeEnabled in app.json.
function Root() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);