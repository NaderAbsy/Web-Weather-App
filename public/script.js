document.addEventListener("DOMContentLoaded", () => {
  const apiKey = "d6d5d476efed3e0953cd23870e8672db";
  const weatherInfo = document.getElementById("weather-info");
  const loadingElem = document.getElementById("loading");
  const locationElem = document.getElementById("location");
  const temperatureElem = document.getElementById("temperature");
  const descriptionElem = document.getElementById("description");
  const humidityElem = document.getElementById("humidity");
  const windElem = document.getElementById("wind");
  const cityInput = document.getElementById("city-input");
  const searchButton = document.getElementById("search-button");
  const mapContainer = document.getElementById("map");
  const forecastContainer = document.getElementById("forecast-cards");
  const toggleUnitsButton = document.getElementById("toggle-units");
  const loginButton = document.getElementById("login-button");

  let city;
  let map;
  let marker;
  let currentUnits = "metric"; // default to metric (Celsius)

  const displayWeatherInfo = (data) => {
    loadingElem.style.display = "none";
    const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
    const tempUnit = currentUnits === "metric" ? "°C" : "°F";

    locationElem.textContent = `${data.name}, ${data.sys.country}`;
    temperatureElem.innerHTML = `Temperature: ${data.main.temp}${tempUnit} <img src="${iconUrl}" alt="Weather icon">`;
    descriptionElem.textContent = `Description: ${data.weather[0].description}`;
    humidityElem.textContent = `Humidity: ${data.main.humidity}%`;
    windElem.textContent = `Wind Speed: ${data.wind.speed} m/s`;
    city = `${data.name}`;

    locationElem.style.display = "block";
    temperatureElem.style.display = "block";
    descriptionElem.style.display = "block";
    humidityElem.style.display = "block";
    windElem.style.display = "block";

    // Map code (optional, can be uncommented if needed)
    // if (!map) {
    //   map = L.map("map").setView([data.coord.lat, data.coord.lon], 10);
    //   L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    //     attribution:
    //       '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    //   }).addTo(map);
    //   marker = L.marker([data.coord.lat, data.coord.lon])
    //     .addTo(map)
    //     .bindPopup(`${data.name}, ${data.sys.country}`)
    //     .openPopup();
    // } else {
    //   map.setView([data.coord.lat, data.coord.lon], 10);
    //   marker
    //     .setLatLng([data.coord.lat, data.coord.lon])
    //     .setPopupContent(`${data.name}, ${data.sys.country}`)
    //     .openPopup();
    // }
  };

  const displayForecast = (data) => {
    forecastContainer.innerHTML = "";
    const forecastList = data.list.filter((item) =>
      item.dt_txt.includes("12:00:00")
    );
    const tempUnit = currentUnits === "metric" ? "°C" : "°F";

    forecastList.forEach((day) => {
      const iconUrl = `https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png`;
      const forecastCard = document.createElement("div");
      forecastCard.classList.add("forecast-card");
      forecastCard.innerHTML = `
                <h3>${new Date(day.dt_txt).toLocaleDateString()}</h3>
                <img src="${iconUrl}" alt="Weather icon">
                <p>Temperature: ${day.main.temp}${tempUnit}</p>
                <p>Description: ${day.weather[0].description}</p>
                <p>Humidity: ${day.main.humidity}%</p>
                <p>Wind Speed: ${day.wind.speed} m/s</p>
            `;
      forecastContainer.appendChild(forecastCard);
    });
  };

  const showError = (message) => {
    loadingElem.style.display = "none";
    locationElem.style.display = "block";
    locationElem.textContent = message;
    temperatureElem.style.display = "none";
    descriptionElem.style.display = "none";
    humidityElem.style.display = "none";
    windElem.style.display = "none";
  };

  const fetchWeatherData = (url, forecastUrl) => {
    loadingElem.style.display = "block";
    locationElem.style.display = "none";
    temperatureElem.style.display = "none";
    descriptionElem.style.display = "none";
    humidityElem.style.display = "none";
    windElem.style.display = "none";

    Promise.all([
      fetch(url).then((response) => response.json()),
      fetch(forecastUrl).then((response) => response.json()),
    ])
      .then(([weatherData, forecastData]) => {
        if (weatherData.cod === 200) {
          displayWeatherInfo(weatherData);
          displayForecast(forecastData);
        } else {
          showError("City not found");
        }
      })
      .catch(() => {
        showError("Error fetching data");
      });
  };

  const updateWeather = () => {
    if (cityInput.value) {
      city = cityInput.value.trim();
    }
    if (city) {
      const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=${currentUnits}`;
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${apiKey}&units=${currentUnits}`;
      fetchWeatherData(apiUrl, forecastUrl);
    }
  };

  searchButton.addEventListener("click", updateWeather);

  toggleUnitsButton.addEventListener("click", () => {
    currentUnits = currentUnits === "metric" ? "imperial" : "metric";
    toggleUnitsButton.textContent =
      currentUnits === "metric" ? "Switch to Fahrenheit" : "Switch to Celsius";
    updateWeather();
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${currentUnits}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${currentUnits}`;
        fetchWeatherData(apiUrl, forecastUrl);
      },
      () => {
        showError("Unable to retrieve your location");
      }
    );
  } else {
    showError("Geolocation is not supported by this browser.");
  }

  const fetchCitySuggestions = (query, callback) => {
    $.ajax({
      url: `https://api.openweathermap.org/data/2.5/find?q=${query}&type=like&appid=${apiKey}`,
      method: "GET",
      success: (response) => {
        const citySuggestions = response.list.map(
          (city) => `${city.name}, ${city.sys.country}`
        );
        callback(citySuggestions);
      },
    });
  };

  $("#city-input").autocomplete({
    source: function (request, response) {
      fetchCitySuggestions(request.term, function (suggestions) {
        response(suggestions);
      });
    },
    minLength: 2,
  });

  $("#city-input").keypress(function (event) {
    if (event.which == 13) {
      event.preventDefault();
      $("#search-button").click();
    }
  });

  loginButton.addEventListener("click", () => {
    window.location.href = "login.html";
  });
});

function ToggleMenu() {
  document.getElementById("myDropdown").classList.toggle("show");
}

window.onclick = function (event) {
  if (!event.target.matches(".dropbtn")) {
    var dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      let openDropdown = dropdowns[i];
      if (openDropdown.classList.contains("show")) {
        openDropdown.classList.remove("show");
      }
    }
  }
};

function ChangeTheme(newTheme) {
  document.getElementById("Style").href = newTheme + ".css";
}
