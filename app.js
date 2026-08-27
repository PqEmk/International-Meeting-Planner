document.addEventListener('DOMContentLoaded', () => {
    const localDateInput = document.getElementById('local-date');
    const localTimeInput = document.getElementById('local-time');
    const detectedTzSpan = document.getElementById('detected-tz');
    const tzSearchInput = document.getElementById('tz-search');
    const tzDropdown = document.getElementById('tz-dropdown');
    const targetListContainer = document.getElementById('target-list');

    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    detectedTzSpan.textContent = userTimezone.replace(/_/g, ' ');

    // State
    let selectedLocations = [];
    
    // Load state from localStorage if available
    try {
        const saved = localStorage.getItem('meetingLocations');
        if (saved) {
            selectedLocations = JSON.parse(saved);
        } else {
            // Migrate from old state if exists
            const oldSaved = localStorage.getItem('meetingTimezones');
            if (oldSaved) {
                const oldTzs = JSON.parse(oldSaved);
                selectedLocations = oldTzs.map(tz => ({
                    id: tz, 
                    name: tz.split('/').pop().replace(/_/g, ' '), 
                    country: tz.split('/')[0] || '', 
                    timezone: tz 
                }));
                localStorage.removeItem('meetingTimezones');
                saveState();
            }
        }
    } catch (e) {
        console.error('Could not load from localStorage', e);
    }

    // Initialize with current date and time rounded to next hour
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    
    // Format YYYY-MM-DD
    const pad = (n) => n.toString().padStart(2, '0');
    const initDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const initTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    
    localDateInput.value = initDate;
    localTimeInput.value = initTime;

    // Event Listeners
    localDateInput.addEventListener('input', updateUI);
    localTimeInput.addEventListener('input', updateUI);
    
    let debounceTimer;
    tzSearchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        
        if (!query) {
            tzDropdown.hidden = true;
            return;
        }

        // Add a loading indicator
        tzDropdown.innerHTML = '<li style="color: var(--text-secondary); pointer-events: none;">Searching...</li>';
        tzDropdown.hidden = false;
        
        debounceTimer = setTimeout(async () => {
            try {
                // Using Open-Meteo free geocoding API to find cities worldwide
                const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
                const data = await response.json();
                
                tzDropdown.innerHTML = '';
                
                if (data.results && data.results.length > 0) {
                    const seen = new Set();
                    data.results.forEach(city => {
                        const countryName = city.country || city.country_code || '';
                        const displayName = `${city.name}${countryName ? ', ' + countryName : ''}`;
                        
                        // Prevent identical names from showing up multiple times
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
                                tzSearchInput.value = '';
                                tzDropdown.hidden = true;
                            } else {
                                alert("Sorry, no timezone data available for this location.");
                            }
                        });
                        tzDropdown.appendChild(li);
                    });
                    tzDropdown.hidden = false;
                } else {
                    tzDropdown.innerHTML = '<li style="color: var(--text-secondary); pointer-events: none;">No cities found</li>';
                }
            } catch (err) {
                console.error(err);
                tzDropdown.innerHTML = '<li style="color: var(--danger); pointer-events: none;">Error searching cities</li>';
            }
        }, 300); // 300ms debounce
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!tzSearchInput.contains(e.target) && !tzDropdown.contains(e.target)) {
            tzDropdown.hidden = true;
        }
    });

    function addLocation(locationObj) {
        // Prevent exact duplicates
        if (!selectedLocations.some(loc => loc.id === locationObj.id)) {
            selectedLocations.push(locationObj);
            saveState();
            updateUI();
        }
    }

    window.removeLocation = function(id) {
        selectedLocations = selectedLocations.filter(loc => String(loc.id) !== String(id));
        saveState();
        updateUI();
    }

    function saveState() {
        localStorage.setItem('meetingLocations', JSON.stringify(selectedLocations));
    }

    function updateUI() {
        if (!localDateInput.value || !localTimeInput.value) {
            targetListContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Please enter a valid date and time.</p>';
            return;
        }

        // Parse local input as a Date object in the user's local timezone
        const localDateTimeStr = `${localDateInput.value}T${localTimeInput.value}`;
        const dateObj = new Date(localDateTimeStr);

        if (isNaN(dateObj.getTime())) {
            return;
        }

        if (selectedLocations.length === 0) {
            targetListContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Search and add regions to see converted times.</p>';
            return;
        }

        targetListContainer.innerHTML = '';
        
        selectedLocations.forEach(loc => {
            try {
                // Format time and date for the specific timezone
                const timeFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: loc.timezone,
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                
                const dateFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: loc.timezone,
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });

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
                            <div class="time">${formattedTime}</div>
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

    // Initial render
    updateUI();
});
