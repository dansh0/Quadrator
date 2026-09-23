import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/**
 * Theme ported from the legacy app (src/plugins/vuetify.js) so the new UI
 * keeps the same look-and-feel: dark by default, green primary, dark panels.
 * Material palette names (green accent4 etc.) are resolved to their hex
 * values since Vuetify 3 dropped the colors util re-export.
 */
export function createAppVuetify() {
  return createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: 'dark',
      themes: {
        dark: {
          dark: true,
          colors: {
            primary: '#128767',
            secondary: '#bcf6ff',
            tertiary: '#444449',
            accent: '#3ab1cb',
            error: '#c46354',
            green: '#00c853',
            dimText: '#9e9e9e',
            brightText: '#f5f5f5',
            background: '#222229',
          },
        },
        light: {
          dark: false,
          colors: {
            primary: '#1397e3',
            secondary: '#eeeeee',
            tertiary: '#30859c',
            error: '#c46354',
            green: '#00897b',
            dimText: '#616161',
            brightText: '#212121',
            yellow: '#fdd835',
          },
        },
      },
    },
  });
}
