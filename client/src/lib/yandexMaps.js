let loading;

export function loadYandexMaps() {
  if (loading) return loading;
  const key = import.meta.env.VITE_YANDEX_MAPS_KEY;
  let script;
  loading = new Promise((resolve, reject) => {
    if (!key) return reject(new Error('Не задан ключ Яндекс Карт (VITE_YANDEX_MAPS_KEY)'));
    script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => window.ymaps3.ready.then(() => resolve(window.ymaps3), reject);
    script.onerror = () => reject(new Error('Не удалось загрузить скрипт Яндекс Карт. Проверьте ключ и соединение.'));
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    script?.remove();
    throw error;
  });
  return loading;
}
