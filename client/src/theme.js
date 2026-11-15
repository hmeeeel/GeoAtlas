import { createTheme } from '@mui/material/styles';

// Палитра атласа: тёмная морская бирюза и охра для акцентов на карте.
export const theme = createTheme({
  palette: {
    primary: { main: '#9370DB' },
    secondary: { main: '#B7791F' },
    background: { default: '#FFFFFF', paper: '#FFFFFF' },
    text: { primary: '#14232B', secondary: '#4A5B63' },
  },
  shape: { borderRadius: 0 },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #D8E0E3' } } },
    MuiDataGrid: { styleOverrides: { root: { border: 'none' } } },
  },
});
