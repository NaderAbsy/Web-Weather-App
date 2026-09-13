# Weather App

A weather forecast web application built on the OpenWeather API, with Firebase
authentication and a Firestore-backed user store.

## What it does

Users sign up, log in and view live weather data for a location. Accounts are handled through
Firebase Authentication with email/password and a password reset flow, and usernames are
validated for uniqueness against Firestore. The interface ships with several colour themes.

## Features

- **Live weather data** from the OpenWeather API
- **Firebase Authentication** — sign up, log in, password reset
- **Firestore** user records with unique-username validation
- **Multiple themes** — light, dark, green, pink
- **Custom 404** page

## Stack

JavaScript · Firebase Authentication · Cloud Firestore · OpenWeather API · HTML/CSS

## Structure

```
public/
  index.html / index.js      Main weather view
  login.html / login.js      Authentication
  signup.html / signup.js    Registration with username validation
  reset-password.html/.js    Password reset
  fireBaseScript.js          Firebase initialisation
  Light.css / Dark.css / Green.css / Pink.css   Themes
```

## Running it

You'll need a Firebase project and an OpenWeather API key.

```bash
firebase login
firebase serve
```

Add your own Firebase config and OpenWeather key before running — don't commit either.

---

Built by [Nader Absy](https://naderabsy.com)
