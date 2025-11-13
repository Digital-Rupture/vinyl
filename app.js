// VETERAN CLASS NOTE: This script is organized for clarity and uses modern JavaScript modules.
// It handles anonymous Firebase authentication, real-time Firestore listening, 
// and efficient batch uploading of JSON data.

// =================================================================
// 1. SETUP & UTILITIES 
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    onSnapshot, 
    doc,
    setLogLevel,
    writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;

// State for filtering (placeholders for now)
let currentFilters = {
    format: '',
    yearFrom: null,
    yearTo: null,
};

// Configuration and Paths
const COLLECTION_PATH = 'records'; 
const APP_ID = 'vinyl-archiver-web'; // Use a consistent App ID for Firestore paths

// YOUR UNIQUE FIREBASE CONFIGURATION HAS BEEN ADDED HERE
const firebaseConfig = {
    apiKey: "AIzaSyA2JDWhhjW5ZRz7BRfG1eNUOOcNXPbRK5g",
    authDomain: "vinyl-digitalrupture.firebaseapp.com",
    projectId: "vinyl-digitalrupture",
    storageBucket: "vinyl-digitalrupture.firebasestorage.app",
    messagingSenderId: "991728224627",
    appId: "1:991728224627:web:7143682c8696ae704f9d06"
};


/**
 * Initializes Firebase, authenticates the user, and sets up the listener.
 */
async function initFirebaseAndAuth() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // This is a simplified auth for a demo/learning environment.
        await new Promise(resolve => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                    document.getElementById('user-id-display').textContent = userId;
                    isAuthReady = true;
                    console.log("Firebase Auth Ready. User ID:", userId);
                    unsubscribe(); 
                    resolve();
                } else {
                    // Sign in anonymously if no user is found
                    await signInAnonymously(auth);
                }
            });
        });
    } catch (error) {
        console.error("Firebase Initialization or Auth Error:", error);
        throw new Error(`Authentication failed: ${error.message}`);
    }
}


/**
 * Helper function to show temporary status messages (Success/Error/Info)
 */
function showMessage(messageBox, message, type) {
    messageBox.textContent = message;
    messageBox.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl';
    
    switch (type) {
        case 'success':
            messageBox.classList.add('bg-green-600', 'text-white');
            break;
        case 'error':
            messageBox.classList.add('bg-red-600', 'text-white');
            break;
        case 'info':
        default:
            messageBox.classList.add('bg-blue-600', 'text-white');
            break;
    }
    
    messageBox.style.display = 'block';
    
    setTimeout(() => {
        messageBox.style.display = 'none';
        messageBox.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl hidden';
    }, 5000);
}

// =================================================================
// 2. CORE DISPLAY & DATA LOGIC
// =================================================================

/**
 * Renders the album cards to the UI.
 */
function renderAlbums(records) {
    const albumGrid = document.getElementById('album-grid');
    const loadingIndicator = document.getElementById('loading-indicator');
    albumGrid.innerHTML = '';
    loadingIndicator.style.display = 'none';
    
    if (records.length === 0) {
        albumGrid.innerHTML = '<p class="col-span-full text-center text-gray-500 text-lg py-10">No records found. Use the **Upload** button to get started!</p>';
        return;
    }

    records.forEach(record => {
        // Simple rendering based on the fields we've established
        const card = document.createElement('div');
        card.className = 'album-card bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-transform duration-200 hover:scale-[1.02] cursor-pointer';

        const cardContent = `
            <img src="${record.cover_url || 'https://placehold.co/300x300/1A1A1A/E0E0E0?text=Vinyl'}" 
                 alt="${record.title} album cover" 
                 class="w-full h-auto object-cover">
            <div class="p-4">
                <p class="text-xs text-gray-500 mb-1">${record.label} (${record.original_release_year})</p>
                <h3 class="text-xl font-semibold text-white truncate" title="${record.title}">${record.title}</h3>
                <p class="text-md text-yellow-400 mb-2">${record.artist}</p>
                <div class="flex justify-between items-center text-sm mt-3">
                    <span class="text-gray-400">Value Range:</span>
                    <span class="font-bold text-lg text-green-500">$${(record.estimated_value_low || 0).toFixed(2)} - $${(record.estimated_value_high || 0).toFixed(2)}</span>
                </div>
                <p class="text-xs text-gray-500 mt-1">Catalog No: ${record.catalog_no}</p>
            </div>
        `;
        card.innerHTML = cardContent;
        albumGrid.appendChild(card);
    });
}


/**
 * Subscribes to the user's collection in Firestore for real-time updates.
 */
function fetchData(messageBox) {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (!db || !userId || !isAuthReady) return () => {}; 
    
    loadingIndicator.style.display = 'block';

    try {
        // Path: /artifacts/{APP_ID}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', APP_ID, 'users', userId, COLLECTION_PATH);
        const q = query(recordsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tempRecords = [];
            snapshot.forEach((doc) => {
                const record = doc.data();
                tempRecords.push({ id: doc.id, ...record }); 
            });
            
            allRecords = tempRecords; // Update global state
            
            // Re-run the current search/filter with the new data
            applySearchAndFilter(
                document.getElementById('search-input')
            );
            
            // Initial load check
            if (loadingIndicator.style.display === 'block' && allRecords.length > 0) {
                 showMessage(messageBox, `Collection successfully loaded: ${allRecords.length} records.`, 'success');
            }
            loadingIndicator.style.display = 'none';

        }, (error) => {
            loadingIndicator.style.display = 'none';
            showMessage(messageBox, `Error listening to Firestore: ${error.message}`, 'error');
            console.error("Firestore onSnapshot Error:", error);
        });

        return unsubscribe;

    } catch (error) {
        loadingIndicator.style.display = 'none';
        showMessage(messageBox, `Failed to setup data listener: ${error.message}`, 'error');
        return () => {};
    }
}


// =================================================================
// 3. USER INTERACTION (Search & Filter)
// =================================================================

/**
 * Applies the current search and filter criteria to the global records array.
 */
function applySearchAndFilter(searchInput) {
    const searchQuery = (searchInput?.value || '').toLowerCase();
    const { yearFrom, yearTo } = currentFilters;

    const filteredRecords = allRecords.filter(record => {
        // 1. Search Filter (Artist/Title)
        const matchesSearch = record.artist.toLowerCase().includes(searchQuery) ||
                              record.title.toLowerCase().includes(searchQuery);

        if (!matchesSearch) return false;

        // 2. Year Filter
        const recordYear = parseInt(record.original_release_year, 10);
        
        let matchesYear = true;
        if (yearFrom !== null && !isNaN(yearFrom) && recordYear < yearFrom) {
            matchesYear = false;
        }
        if (yearTo !== null && !isNaN(yearTo) && recordYear > yearTo) {
            matchesYear = false;
        }

        return matchesYear;
    });

    renderAlbums(filteredRecords);
}

// =================================================================
// 4. JSON FILE UPLOAD LOGIC (Batch Write)
// =================================================================

/**
 * Uploads an array of records efficiently to Firestore using a batch write.
 */
async function uploadRecordsToFirestore(records, messageBox) {
    if (!db || !userId) {
        showMessage(messageBox, 'Database not ready or user not signed in.', 'error');
        return;
    }

    try {
        let batch = writeBatch(db);
        // Path: /artifacts/{APP_ID}/users/{userId}/records
        const collectionRef = collection(db, 'artifacts', APP_ID, 'users', userId, COLLECTION_PATH);
        
        const batchLimit = 499; // Firestore batch limit is 500 operations (499 writes + 1 commit)
        let currentBatchCount = 0;
        
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            
            // Create a new document reference with an auto-generated ID
            const docRef = doc(collectionRef); 
            
            // Use set to add the record to the batch
            batch.set(docRef, record);

            currentBatchCount++;

            // Commit the batch if we hit the limit
            if (currentBatchCount >= batchLimit) {
                await batch.commit();
                showMessage(messageBox, `Committed batch of ${currentBatchCount} records. Processing next batch...`, 'info');
                batch = writeBatch(db); // Start a new batch
                currentBatchCount = 0;
            }
        }

        // Commit the final, non-full batch
        if (currentBatchCount > 0) {
             await batch.commit();
        }
        
        showMessage(messageBox, `Successfully imported ${records.length} records into your collection!`, 'success');
        
    } catch (e) {
        showMessage(messageBox, `Error during batch upload: ${e.message}`, 'error');
        console.error("Error batch uploading documents: ", e);
    }
}


/**
 * Handles the file selection, reads the file content, and starts the upload.
 */
function handleFileUpload(event, messageBox) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const jsonText = e.target.result;
            const records = JSON.parse(jsonText);

            if (!Array.isArray(records)) {
                showMessage(messageBox, 'File content is not a JSON array of records. Please check format.', 'error');
                return;
            }

            showMessage(messageBox, `Found ${records.length} records in file. Starting batch upload...`, 'info');
            await uploadRecordsToFirestore(records, messageBox);

        } catch (error) {
            showMessage(messageBox, `Failed to parse JSON file: ${error.message}`, 'error');
            console.error("JSON Parsing Error:", error);
        }
        // Reset file input value to allow the same file to be selected again
        event.target.value = '';
    };

    reader.onerror = () => {
        showMessage(messageBox, 'Error reading file.', 'error');
    };

    reader.readAsText(file);
}


// =================================================================
// 5. APPLICATION INITIALIZATION
// =================================================================

/**
 * Main application initializer function.
 */
async function initApp() {
    const searchInput = document.getElementById('search-input');
    const messageBox = document.getElementById('message-box');
    const filterModal = document.getElementById('filter-modal');
    const filterBtn = document.getElementById('filter-btn');
    const closeFilterBtn = document.getElementById('close-filter-modal');
    const applyFilterButton = document.getElementById('apply-filter-button');
    const resetFilterButton = document.getElementById('reset-filter-button');
    const uploadBtn = document.getElementById('upload-btn');
    const jsonFileInput = document.getElementById('json-file-input');


    try {
        // 1. Initialize Firebase and sign in
        await initFirebaseAndAuth();

        // 2. Set up Firestore listener (will update UI automatically)
        fetchData(messageBox);
        
        // 3. Setup Event Listeners

        // Search Input Listener
        searchInput.addEventListener('input', () => 
            applySearchAndFilter(searchInput)
        );

        // Filter Modal Controls
        filterBtn.addEventListener('click', () => filterModal.classList.remove('hidden'));
        closeFilterBtn.addEventListener('click', () => filterModal.classList.add('hidden'));

        // Apply Filters 
        applyFilterButton.addEventListener('click', () => {
            // (Add logic here to capture filter-format, filter-year-from, etc.)
            const yearFrom = document.getElementById('filter-year-from').value;
            const yearTo = document.getElementById('filter-year-to').value;
            
            currentFilters.yearFrom = yearFrom ? parseInt(yearFrom, 10) : null;
            currentFilters.yearTo = yearTo ? parseInt(yearTo, 10) : null;

            filterModal.classList.add('hidden');
            applySearchAndFilter(searchInput);
        });
        
        // Reset Filters 
        resetFilterButton.addEventListener('click', () => {
            document.getElementById('filter-year-from').value = '';
            document.getElementById('filter-year-to').value = '';
            currentFilters.yearFrom = null;
            currentFilters.yearTo = null;
            document.getElementById('filter-format').value = ''; // Reset format too

            filterModal.classList.add('hidden');
            applySearchAndFilter(searchInput);
        });
        
        // File Upload Listeners
        uploadBtn.addEventListener('click', () => {
            jsonFileInput.click();
        });

        jsonFileInput.addEventListener('change', (event) => 
            handleFileUpload(event, messageBox)
        );


    } catch (error) {
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
    }
}

// Start the application when the window loads
window.onload = initApp;
