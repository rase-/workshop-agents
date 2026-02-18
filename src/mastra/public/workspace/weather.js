async function fetchCoordinates(city) {
    const geoApiUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}`;
    const response = await fetch(geoApiUrl);
    if (!response.ok) {
        throw new Error(`Geo API returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
        throw new Error('No results found for the specified city');
    }
    return data.results[0];
}

async function fetchWeatherForecast(latitude, longitude) {
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`Weather API returned ${response.status}: ${response.statusText}`);
    }
    return response.json();
}

const city = process.argv[2];

if (!city) {
    console.error('Usage: node weather.js <city>');
    process.exit(1);
}

fetchCoordinates(city)
    .then(({ latitude, longitude }) => fetchWeatherForecast(latitude, longitude))
    .then((data) => console.log(`Weather for ${city}:`, data))
    .catch((error) => {
        console.error('Error:', error.message);
        process.exit(1);
    });
