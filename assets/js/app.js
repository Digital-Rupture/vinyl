document.addEventListener('DOMContentLoaded', () => {
    
    // --- GLOBAL VARIABLES ---
    const DATA_PATH = '/vynil/assets/json/initialcollection.json';
    const collectionGrid = document.getElementById('collection-grid');
    const searchInput = document.getElementById('search-input');
    let allRecords = []; // Variable to store the original, complete collection data

    // --- UTILITY FUNCTIONS ---
    
    // 1. Value Color function (Unchanged from previous code)
    function getValueColor(low, high) {
        if (high > 40) {
            return 'var(--color-value-high)';
        } else if (low >= 20) {
            return 'var(--color-value-mid)';
        } else {
            return 'var(--color-value-low)';
        }
    }

    // 2. Card Creation function (Unchanged from previous code)
    function createRecordCard(record) {
        const card = document.createElement('div');
        card.classList.add('album-card');
        card.setAttribute('data-id', record.id);
        const imagePath = `/vynil/assets/images/${record.id}.jpg`;
        const indicatorColor = getValueColor(record.estimated_value_low, record.estimated_value_high);

        card.innerHTML = `
            <img src="${imagePath}" alt="${record.artist} - ${record.title} Album Cover" class="album-cover">
            <div class="card-details">
                <p class="card-artist"><strong>${record.artist}</strong></p>
                <p class="card-title">${record.title}</p>
                <div class="value-indicator" style="background-color: ${indicatorColor};" 
                     title="Est. Value: $${record.estimated_value_low.toFixed(2)} - $${record.estimated_value_high.toFixed(2)}">
                </div>
            </div>
        `;
        return card;
    }

    // 3. Rendering function (Re-usable for initial load and filtering)
    function renderCollection(recordsToDisplay) {
        collectionGrid.innerHTML = ''; // Clear existing content
        
        if (recordsToDisplay.length === 0) {
             collectionGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; margin-top: 3rem; color: var(--color-text-secondary);">No records match your search criteria.</p>';
        } else {
            recordsToDisplay.forEach(record => {
                const cardElement = createRecordCard(record);
                collectionGrid.appendChild(cardElement);
            });
        }
    }

    // --- MAIN LOGIC ---

    // 4. Function to handle filtering records based on search input
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();

        const filteredRecords = allRecords.filter(record => {
            const artist = record.artist.toLowerCase();
            const title = record.title.toLowerCase();

            // Check if the query is included in either the artist or the title
            return artist.includes(query) || title.includes(query);
        });

        // Re-render the grid with the filtered results
        renderCollection(filteredRecords);
    }

    // 5. Initial Data Fetch and Setup
    async function initApp() {
        try {
            const response = await fetch(DATA_PATH);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Store the data in the global variable
            allRecords = await response.json(); 

            // Initial render of the full collection
            renderCollection(allRecords);
            console.log(`Successfully loaded and rendered ${allRecords.length} records.`);
            
        } catch (error) {
            console.error("Could not fetch the collection data:", error);
            collectionGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--color-value-high); text-align: center;">Error loading data. Check console for details. Path: ${DATA_PATH}</p>`;
        }
    }
    
    // --- EVENT LISTENERS ---
    
    // Attach the search function to the input field
    searchInput.addEventListener('keyup', handleSearch);
    
    // Run the initialization function
    initApp();
});
