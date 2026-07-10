import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { enableScreens } from 'react-native-screens';
import HomeScreen from './screens/HomeScreen';
import DetailsScreen from './screens/DetailsScreen';
import PlayerScreen from './screens/PlayerScreen';

// Enable native screen containers — replaces JS View-based screens with
// native UIViewController / Fragment equivalents for faster navigation.
enableScreens(true);

const Stack = createStackNavigator();

// Defined outside the component so the object reference is stable across
// renders — prevents NavigationContainer from re-diffing screenOptions.
const NAVIGATOR_SCREEN_OPTIONS = {
  headerStyle: {
    backgroundColor: '#0F0F14',
    borderBottomWidth: 0,
    shadowColor: 'transparent',
  },
  headerTintColor: '#F3F4F6',
  headerTitleStyle: {
    fontWeight: 'bold',
  },
  cardStyle: { backgroundColor: '#09090C' },
};

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={NAVIGATOR_SCREEN_OPTIONS}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Details"
          component={DetailsScreen}
          options={{ title: 'Media Info' }}
        />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
