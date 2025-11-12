document.addEventListener('DOMContentLoaded', () => {
    // 1. Define the path to the JSON data file.
    const DATA_PATH = '/vynil/assets/json/initialcollection.json';
    const collectionGrid = document.getElementById('collection-grid');

    // 2. Function to determine the color for the Value Indicator based on price range
    function getValueColor(low, high) {
        // Simple logic for illustration: 
        // High Value: > $40
        // Mid Value: $20 to $40
        // Low Value: < $20
        if (high > 40) {
            return 'var(--color-value-high)';
        } else if (low >= 20) {
            return 'var(--color-value-mid)';
        } else {
            return 'var(--color-value-low)';
        }
    }

    // 3. Function to create the HTML element for a single record card
    function createRecordCard(record) {
        // Create the main card container
        const card = document.createElement('div');
        card.classList.add('album-card');
        card.setAttribute('data-id', record.id);
        
        // Determine the image path (assuming images are stored by ID in the same assets folder)
        // For a deployed app, you'd use a unique file name here.
        const imagePath = `/vynil/assets/images/${record.id}.jpg`; 

        // Get the value indicator color
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

    // 4. Main function to fetch the data and render the collection
    async function fetchAndRenderCollection() {
        try {
            // Fetch the JSON file from the defined path
            const response = await fetch(DATA_PATH);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const collectionData = await response.json();

            // Clear any placeholder content
            collectionGrid.innerHTML = ''; 

            // Iterate over the data and append each card to the grid
            collectionData.forEach(record => {
                const cardElement = createRecordCard(record);
                collectionGrid.appendChild(cardElement);
            });

            console.log(`Successfully loaded and rendered ${collectionData.length} records.`);
            
        } catch (error) {
            console.error("Could not fetch the collection data:", error);
            collectionGrid.innerHTML = `<p style="color: var(--color-value-high);">Error loading data. Check console for details. Path: ${DATA_PATH}</p>`;
        }
    }

    // Execute the main function
    fetchAndRenderCollection();
});
