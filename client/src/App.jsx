import { Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { CountriesPage, CountryPage, RegionPage } from './pages/OverviewPages.jsx';
import PlacePage from './pages/PlacePage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import QueryBuilderPage from './pages/QueryBuilderPage.jsx';


const NAV = [
  { label: 'Обзор', to: '/countries', match: /^\/(countries|regions|places)/ },
  { label: 'Статистика', to: '/stats', match: /^\/stats/ },
  { label: 'Конструктор запроса', to: '/builder', match: /^\/builder/ },
];

export default function App() {
  const { pathname } = useLocation();
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid #D8E0E3' }}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Box
            component={RouterLink}
            to="/countries"
            sx={{
              display: 'flex',
              alignItems: 'center',
              mr: 3,
              textDecoration: 'none',
              color: 'text.primary',
            }}
          >
            <Typography variant="h6" component="span">
              GeoAtlas
            </Typography>
          </Box>
          {NAV.map((item) => (
            <Button key={item.to} component={RouterLink} to={item.to} variant={item.match.test(pathname) ? 'contained' : 'text'} color="primary">
              {item.label}
            </Button>
          ))}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3, flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/countries" replace />} />
          <Route path="/countries" element={<CountriesPage />} />
          <Route path="/countries/:id" element={<CountryPage />} />
          <Route path="/regions/:id" element={<RegionPage />} />
          <Route path="/places/:id" element={<PlacePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/builder" element={<QueryBuilderPage />} />
          <Route path="*" element={<Typography>Страница не найдена</Typography>} />
        </Routes>
      </Container>

    </Box>
  );
}
