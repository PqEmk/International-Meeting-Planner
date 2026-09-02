document.addEventListener('DOMContentLoaded', () => {
    const localDateInput = document.getElementById('local-date');
    const localTimeInput = document.getElementById('local-time');
    const detectedTzSpan = document.getElementById('detected-tz');
    
    const selContinent = document.getElementById('sel-continent');
    const selCountry = document.getElementById('sel-country');
    const selCity = document.getElementById('sel-city');
    const btnAdd = document.getElementById('btn-add');
    const targetListContainer = document.getElementById('target-list');

    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    detectedTzSpan.textContent = userTimezone.replace(/_/g, ' ');

    // Initialize time to next hour
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const pad = (n) => n.toString().padStart(2, '0');
    localDateInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    localTimeInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    // Load state
    let selectedLocations = [];
    try {
        const saved = localStorage.getItem('meetPlanLocations_v2');
        if (saved) selectedLocations = JSON.parse(saved);
    } catch (e) {}

    // Populate Continent dropdown
    const continents = Object.keys(tzData);
    continents.forEach(cont => {
        const opt = document.createElement('option');
        opt.value = cont;
        opt.textContent = cont;
        selContinent.appendChild(opt);
    });

    // Populate logic
    function populateCountries(continentFilter) {
        selCountry.innerHTML = '<option value="">All Countries</option>';
        let countriesToAdd = new Set();
        
        if (continentFilter) {
            Object.keys(tzData[continentFilter]).forEach(c => countriesToAdd.add(c));
        } else {
            continents.forEach(cont => {
                Object.keys(tzData[cont]).forEach(c => countriesToAdd.add(c));
            });
        }
        
        Array.from(countriesToAdd).sort().forEach(country => {
            const opt = document.createElement('option');
            opt.value = country;
            opt.textContent = country;
            selCountry.appendChild(opt);
        });
    }

    function populateCities(continentFilter, countryFilter) {
        selCity.innerHTML = '<option value="">Select a city...</option>';
        let cities = [];
        
        continents.forEach(cont => {
            if (continentFilter && cont !== continentFilter) return;
            Object.keys(tzData[cont]).forEach(country => {
                if (countryFilter && country !== countryFilter) return;
                
                tzData[cont][country].forEach(cityObj => {
                    cities.push({
                        ...cityObj,
                        _continent: cont,
                        _country: country
                    });
                });
            });
        });
        
        cities.sort((a, b) => a.name.localeCompare(b.name));
        
        cities.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} (${c._country})`;
            // Store metadata so we can auto-fill
            opt.dataset.continent = c._continent;
            opt.dataset.country = c._country;
            opt.dataset.name = c.name;
            selCity.appendChild(opt);
        });
    }

    // Initial population
    populateCountries('');
    populateCities('', '');

    // Event Listeners for cascading and auto-fill
    selContinent.addEventListener('change', (e) => {
        const cont = e.target.value;
        populateCountries(cont);
        populateCities(cont, '');
        selCountry.value = '';
        checkAddButton();
    });

    selCountry.addEventListener('change', (e) => {
        const country = e.target.value;
        const cont = selContinent.value;
        populateCities(cont, country);
        
        // Auto-fill continent if not set
        if (country && !cont) {
            for (let c of continents) {
                if (tzData[c][country]) {
                    selContinent.value = c;
                    break;
                }
            }
        }
        checkAddButton();
    });

    selCity.addEventListener('change', (e) => {
        const selectedOpt = selCity.options[selCity.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
            selContinent.value = selectedOpt.dataset.continent;
            populateCountries(selContinent.value);
            selCountry.value = selectedOpt.dataset.country;
            populateCities(selContinent.value, selCountry.value);
            selCity.value = selectedOpt.value;
        }
        checkAddButton();
    });

    // Smart Search Logic (Open-Meteo API)
    const smartSearchInput = document.getElementById('smart-search');
    const smartDropdown = document.getElementById('smart-dropdown');
    let debounceTimer;

    smartSearchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        
        if (!query) {
            smartDropdown.hidden = true;
            return;
        }

        smartDropdown.innerHTML = '<li style="color: var(--text-secondary); pointer-events: none;">Searching...</li>';
        smartDropdown.hidden = false;
        
        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
                const data = await response.json();
                
                smartDropdown.innerHTML = '';
                
                if (data.results && data.results.length > 0) {
                    const seen = new Set();
                    data.results.forEach(city => {
                        if (city.population === undefined && seen.size > 0) return; // Skip small places if we have hits

                        const countryName = city.country || city.country_code || '';
                        const displayName = `${city.name}${countryName ? ', ' + countryName : ''}`;
                        
                        if (seen.has(displayName)) return;
                        seen.add(displayName);
                        
                        const li = document.createElement('li');
                        li.textContent = displayName;
                        
                        li.addEventListener('click', () => {
                            if (city.timezone) {
                                addLocation({
                                    id: city.id,
                                    name: city.name,
                                    country: countryName,
                                    timezone: city.timezone
                                });
                                smartSearchInput.value = '';
                                smartDropdown.hidden = true;
                            } else {
                                alert("Sorry, no timezone data available for this specific location. Please use the dropdowns instead.");
                            }
                        });
                        smartDropdown.appendChild(li);
                    });
                    smartDropdown.hidden = false;
                } else {
                    smartDropdown.innerHTML = '<li style="color: var(--text-secondary); pointer-events: none;">No cities found</li>';
                }
            } catch (err) {
                console.error(err);
                smartDropdown.innerHTML = '<li style="color: var(--danger); pointer-events: none;">Error searching cities</li>';
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!smartSearchInput.contains(e.target) && !smartDropdown.contains(e.target)) {
            smartDropdown.hidden = true;
        }
    });

    function checkAddButton() {
        btnAdd.disabled = !selCity.value;
    }

    btnAdd.addEventListener('click', () => {
        const selectedOpt = selCity.options[selCity.selectedIndex];
        if (selectedOpt && selectedOpt.value) {
            addLocation({
                id: selectedOpt.value,
                name: selectedOpt.dataset.name,
                country: selectedOpt.dataset.country,
                timezone: selectedOpt.value
            });
            // Reset
            selContinent.value = '';
            populateCountries('');
            populateCities('', '');
            checkAddButton();
        }
    });

    localDateInput.addEventListener('input', updateUI);
    localTimeInput.addEventListener('input', updateUI);

    function addLocation(locationObj) {
        if (!selectedLocations.some(loc => loc.id === locationObj.id)) {
            selectedLocations.push(locationObj);
            localStorage.setItem('meetPlanLocations_v2', JSON.stringify(selectedLocations));
            updateUI();
        }
    }

    window.removeLocation = function(id) {
        selectedLocations = selectedLocations.filter(loc => String(loc.id) !== String(id));
        localStorage.setItem('meetPlanLocations_v2', JSON.stringify(selectedLocations));
        updateUI();
    }

    function updateUI() {
        if (!localDateInput.value || !localTimeInput.value) return;

        const dateObj = new Date(`${localDateInput.value}T${localTimeInput.value}`);
        if (isNaN(dateObj.getTime())) return;

        if (selectedLocations.length === 0) {
            targetListContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Add regions to see converted times.</p>';
            return;
        }

        targetListContainer.innerHTML = '';
        
        selectedLocations.forEach(loc => {
            try {
                const timeFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: loc.timezone, hour: 'numeric', minute: '2-digit', hour12: true
                });
                const dateFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: loc.timezone, weekday: 'short', month: 'short', day: 'numeric'
                });

                const tzAbbrFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: loc.timezone, timeZoneName: 'short'
                });
                const tzParts = tzAbbrFormatter.formatToParts(dateObj);
                const tzAbbr = tzParts.find(p => p.type === 'timeZoneName')?.value || '';

                const formattedTime = timeFormatter.format(dateObj);
                const formattedDate = dateFormatter.format(dateObj);
                
                const card = document.createElement('div');
                card.className = 'target-card';
                card.innerHTML = `
                    <div class="target-info">
                        <h3>${loc.name}</h3>
                        <p>${loc.country} &middot; <span style="opacity: 0.7; font-size: 0.8rem">${loc.timezone.split('/').pop().replace(/_/g, ' ')} Time</span></p>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <div class="target-time">
                            <div class="time">${formattedTime} <span style="font-size: 1rem; color: var(--text-secondary); margin-left: 0.25rem;">${tzAbbr}</span></div>
                            <div class="date">${formattedDate}</div>
                        </div>
                        <button class="remove-btn" onclick="removeLocation('${loc.id}')" aria-label="Remove">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                `;
                targetListContainer.appendChild(card);
            } catch (err) {
                console.error('Error formatting timezone:', loc.timezone, err);
            }
        });
    }

    updateUI();
});
