// ar-graph.js - AR-enabled Knowledge Graph
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';

let scene, camera, renderer, raycaster, mouse;
let nodes = [];
let edges = [];
let graphGroup;
let graphData = null;
let selectedNode = null;
let currentMode = null;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let controller = null;

const nodeColors = {
    'Document': 0xff6b6b,
    'Chunk': 0x4ecdc4,
    'default': 0x45b7d1
};

// Initialize on page load
window.addEventListener('load', () => {
    checkARSupport();
    loadGraphData();
});

async function checkARSupport() {
    if ('xr' in navigator) {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        const msg = document.getElementById('ar-support-msg');
        if (supported) {
            msg.innerHTML = '✅ AR is supported on this device';
            msg.style.color = '#4ecdc4';
        } else {
            msg.innerHTML = '⚠️ AR not supported. Use 3D Mode instead.';
            msg.style.color = '#ff6b6b';
        }
    } else {
        document.getElementById('ar-support-msg').innerHTML = '⚠️ WebXR not available. Use 3D Mode.';
    }
}

async function loadGraphData() {
    try {
        const response = await fetch('./Data/knowledge-graph.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        graphData = await response.json();
        document.getElementById('loading-screen').style.display = 'none';
    } catch (error) {
        console.error('Error loading graph data:', error);
        document.getElementById('loading-screen').innerHTML = `
            <div style="color: white; text-align: center;">
                <h2>❌ Error Loading Data</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()" style="
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 1em;
                ">Retry</button>
            </div>
        `;
    }
}

window.startARMode = async function() {
    if (!graphData) {
        alert('Data not loaded yet. Please wait...');
        return;
    }
    
    currentMode = 'ar';
    document.getElementById('mode-selector').style.display = 'none';
    document.getElementById('ar-instructions').style.display = 'block';
    
    initARScene();
    showUI();
};

window.start3DMode = function() {
    if (!graphData) {
        alert('Data not loaded yet. Please wait...');
        return;
    }
    
    currentMode = '3d';
    document.getElementById('mode-selector').style.display = 'none';
    
    init3DScene();
    showUI();
};

function initARScene() {
    // Create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Create renderer with AR support
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);

    // Add AR button
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    document.body.appendChild(arButton);

    // Lighting for AR
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Create reticle (placement indicator)
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x667eea });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Create graph group
    graphGroup = new THREE.Group();
    graphGroup.visible = false;
    scene.add(graphGroup);

    // Setup graph
    createGraph();

    // Setup AR controls with interaction
    setupARControls();
    
    // Setup mobile events
    setupMobileEvents();

    // Initialize raycasting for AR
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Start animation
    renderer.setAnimationLoop(renderAR);

    document.getElementById('mode-indicator').textContent = '📱 AR Mode';
}

function init3DScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 30;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(20, 20, 20);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0xffffff, 0.4);
    pointLight2.position.set(-20, -20, -20);
    scene.add(pointLight2);

    // Create graph group
    graphGroup = new THREE.Group();
    scene.add(graphGroup);

    // Setup graph
    createGraph();

    // Setup controls
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    setup3DControls();
    
    // Setup mobile events
    setupMobileEvents();

    // Start animation
    animate3D();

    document.getElementById('mode-indicator').textContent = '🖥️ 3D Mode';
}

function setupMobileEvents() {
    // Double-tap to reset view
    let lastTap = 0;
    renderer.domElement.addEventListener('touchend', function(e) {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapLength < 500 && tapLength > 0 && e.touches.length === 0) {
            // Double tap detected
            resetView();
            if (e.cancelable) e.preventDefault();
        }
        lastTap = currentTime;
    });
}

function createGraph() {
    const entities = graphData.entities || [];
    const relationships = graphData.relationships || [];

    // Clear existing
    nodes = [];
    edges = [];
    while (graphGroup.children.length > 0) {
        graphGroup.remove(graphGroup.children[0]);
    }

    const nodeMap = new Map();
    const radius = currentMode === 'ar' ? 0.15 : 15;

    // Create nodes with physics-like distribution
    entities.forEach((entity, index) => {
        const angle = (index / entities.length) * Math.PI * 2;
        const tier = Math.floor(index / 6);
        const r = radius * (1 + tier * 0.3);
        
        const x = Math.cos(angle) * r;
        const y = (Math.random() - 0.5) * radius * 0.5;
        const z = Math.sin(angle) * r;

        const color = nodeColors[entity.type] || nodeColors.default;
        const size = entity.type === 'Document' ? 
            (currentMode === 'ar' ? 0.03 : 1.5) : 
            (currentMode === 'ar' ? 0.015 : 0.8);
        
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshPhongMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const sphere = new THREE.Mesh(geometry, material);
        
        sphere.position.set(x, y, z);
        sphere.userData = entity;
        graphGroup.add(sphere);
        nodes.push(sphere);
        nodeMap.set(entity.id, sphere);
    });

    // Create links
    let links = [];
    if (relationships && relationships.length > 0) {
        links = relationships;
    } else {
        // Auto-create links
        entities.forEach(entity => {
            if (entity.properties && entity.properties.document_id) {
                links.push({
                    source: entity.properties.document_id,
                    target: entity.id
                });
            }
        });
    }

    links.forEach(rel => {
        const sourceNode = nodeMap.get(rel.source);
        const targetNode = nodeMap.get(rel.target);
        
        if (sourceNode && targetNode) {
            const points = [sourceNode.position, targetNode.position];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: 0x888888,
                transparent: true,
                opacity: 0.3
            });
            const line = new THREE.Line(geometry, material);
            graphGroup.add(line);
            edges.push(line);
        }
    });

    // Update stats
    document.getElementById('node-count').textContent = entities.length;
    document.getElementById('link-count').textContent = links.length;

    // Scale graph for AR
    if (currentMode === 'ar') {
        graphGroup.scale.set(1, 1, 1);
    }
}

function setupARControls() {
    // Create controller for interaction
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onARSelect);
    controller.addEventListener('selectstart', onARSelectStart);
    controller.addEventListener('selectend', onARSelectEnd);
    scene.add(controller);

    // Add touch events for mobile AR
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd);
}

function handleTouchStart(e) {
    // Only prevent default for multi-touch gestures
    if (e.touches.length >= 2) {
        e.preventDefault();
    }
    
    if (currentMode === 'ar' && e.touches.length === 2) {
        // Pinch gesture start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        renderer.domElement.userData.pinchStartDistance = distance;
        renderer.domElement.userData.pinchStartScale = graphGroup.scale.x;
    }
    
    if (e.touches.length === 1 && graphGroup.visible) {
        // Single touch - check for node selection
        const touch = e.touches[0];
        const rect = renderer.domElement.getBoundingClientRect();
        
        mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update raycaster
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodes);
        
        if (intersects.length > 0) {
            onNodeSelect(intersects[0].object);
            if (e.cancelable) e.preventDefault();
        }
    }
}

function handleTouchMove(e) {
    if (e.touches.length >= 2) {
        e.preventDefault();
    }
    
    if (currentMode === 'ar' && e.touches.length === 2 && graphGroup.visible) {
        // Pinch to zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (renderer.domElement.userData.pinchStartDistance) {
            const scaleFactor = distance / renderer.domElement.userData.pinchStartDistance;
            const newScale = renderer.domElement.userData.pinchStartScale * scaleFactor;
            
            // Limit scaling
            const minScale = 0.1;
            const maxScale = 5;
            
            graphGroup.scale.setScalar(Math.max(minScale, Math.min(maxScale, newScale)));
        }
    }
}

function handleTouchEnd(e) {
    renderer.domElement.userData.pinchStartDistance = null;
    renderer.domElement.userData.pinchStartScale = null;
    
    // Add single tap detection for node selection
    if (e.changedTouches.length === 1 && graphGroup.visible && currentMode === 'ar') {
        const touch = e.changedTouches[0];
        const rect = renderer.domElement.getBoundingClientRect();
        
        // Calculate normalized device coordinates
        mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update raycaster
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodes);
        
        if (intersects.length > 0) {
            onNodeSelect(intersects[0].object);
        }
    }
}

function onARSelect() {
    if (reticle.visible && !graphGroup.visible) {
        // Place the graph
        graphGroup.position.setFromMatrixPosition(reticle.matrix);
        graphGroup.visible = true;
        document.getElementById('ar-instructions').style.display = 'none';
    } else if (graphGroup.visible) {
        // Check for node selection in AR mode
        const tempRaycaster = new THREE.Raycaster();
        tempRaycaster.setFromXRController(0, renderer.xr.getCamera());
        const intersects = tempRaycaster.intersectObjects(nodes);
        
        if (intersects.length > 0) {
            onNodeSelect(intersects[0].object);
        }
    }
}

function onARSelectStart() {
    // Optional: Visual feedback when starting selection
}

function onARSelectEnd() {
    // Optional: Visual feedback when ending selection
}

function setup3DControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let initialPinchDistance = 0;
    let initialScale = 1;

    // Mouse controls
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            graphGroup.rotation.y += deltaX * 0.01;
            graphGroup.rotation.x += deltaY * 0.01;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('click', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodes);

        if (intersects.length > 0) {
            onNodeSelect(intersects[0].object);
        }
    });

    // Mouse wheel zoom
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.01;
        camera.position.z = Math.max(5, Math.min(100, camera.position.z));
    });

    // Touch controls for mobile
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length >= 2) {
            e.preventDefault();
        }
        
        if (e.touches.length === 2) {
            // Pinch gesture start
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
            initialScale = graphGroup.scale.x;
        } else if (e.touches.length === 1) {
            isDragging = true;
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length >= 2) {
            e.preventDefault();
        }
        
        if (e.touches.length === 2) {
            // Pinch to zoom
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (initialPinchDistance) {
                const scaleFactor = distance / initialPinchDistance;
                const newScale = initialScale * scaleFactor;
                
                // Limit scaling
                const minScale = 0.1;
                const maxScale = 5;
                
                graphGroup.scale.setScalar(Math.max(minScale, Math.min(maxScale, newScale)));
            }
        } else if (e.touches.length === 1 && isDragging) {
            // Single touch rotation
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;

            graphGroup.rotation.y += deltaX * 0.01;
            graphGroup.rotation.x += deltaY * 0.01;

            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });

    renderer.domElement.addEventListener('touchend', (e) => {
        isDragging = false;
        initialPinchDistance = 0;
        
        // Single tap for node selection
        if (e.touches.length === 0 && e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            const rect = renderer.domElement.getBoundingClientRect();
            
            mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(nodes);

            if (intersects.length > 0) {
                onNodeSelect(intersects[0].object);
            }
        }
    });
}

function onNodeSelect(node) {
    // Deselect previous node
    if (selectedNode) {
        selectedNode.material.emissiveIntensity = 0.3;
        selectedNode.scale.set(1, 1, 1);
    }
    
    // Select new node
    selectedNode = node;
    selectedNode.material.emissiveIntensity = 0.8;
    selectedNode.scale.set(1.5, 1.5, 1.5);
    
    // Show node info
    displayNodeInfo(node.userData);
    
    // Make sure info panel is visible on mobile
    document.getElementById('node-info').style.display = 'block';
    
    // Visual feedback
    const originalColor = nodeColors[node.userData.type] || nodeColors.default;
    node.material.color.setHex(0xffffff);
    setTimeout(() => {
        node.material.color.setHex(originalColor);
    }, 300);
}

function displayNodeInfo(data) {
    let html = `
        <div class="info-header">
            <strong>Type:</strong> ${data.type}
        </div>
        <div class="info-item">
            <strong>Label:</strong> ${data.label || 'No label'}
        </div>
    `;

    if (data.source_doc) {
        html += `<div class="info-item"><strong>Source:</strong> ${data.source_doc}</div>`;
    }

    if (data.properties) {
        html += '<div class="info-section"><strong>Properties:</strong></div>';
        for (const [key, value] of Object.entries(data.properties)) {
            let displayValue = value;
            if (Array.isArray(value)) {
                displayValue = value.join(', ');
            } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
            }
            html += `<div class="property"><strong>${key}:</strong> ${displayValue}</div>`;
        }
    }

    // Add some CSS for better mobile display
    const style = document.createElement('style');
    style.textContent = `
        .info-header { font-size: 1.1em; margin-bottom: 8px; color: #4ecdc4; }
        .info-item { margin-bottom: 6px; }
        .info-section { margin-top: 12px; margin-bottom: 6px; color: #ff6b6b; }
        .property { margin-left: 10px; margin-bottom: 4px; font-size: 0.9em; word-break: break-word; }
        #node-info {
            display: block !important;
            position: fixed;
            bottom: 120px;
            left: 10px;
            right: 10px;
            max-height: 30vh;
            overflow-y: auto;
            background: rgba(10, 10, 10, 0.95);
            border: 1px solid #4ecdc4;
            padding: 15px;
            z-index: 1000;
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
        }
    `;
    
    // Remove existing style if any
    const existingStyle = document.querySelector('#node-info-style');
    if (existingStyle) existingStyle.remove();
    style.id = 'node-info-style';
    document.head.appendChild(style);
    
    document.getElementById('node-info').innerHTML = html;
    document.getElementById('node-info').scrollTop = 0;
}

function renderAR(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });

            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length && !graphGroup.visible) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }

        // Rotate graph slowly
        if (graphGroup.visible) {
            graphGroup.rotation.y += 0.002;
        }
    }

    renderer.render(scene, camera);
}

function animate3D() {
    requestAnimationFrame(animate3D);

    // Gentle rotation
    if (graphGroup) {
        graphGroup.rotation.y += 0.001;
    }

    renderer.render(scene, camera);
}

function showUI() {
    document.getElementById('info-panel').style.display = 'block';
    document.getElementById('stats').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';
    if (currentMode === '3d') {
        document.querySelector('.legend').style.display = 'block';
    }
    
    // Ensure node info is properly displayed
    document.getElementById('node-info').style.display = 'block';
}

window.resetView = function() {
    if (currentMode === '3d') {
        camera.position.set(0, 0, 30);
        graphGroup.rotation.set(0, 0, 0);
        graphGroup.scale.set(1, 1, 1);
    } else if (currentMode === 'ar') {
        graphGroup.scale.set(1, 1, 1);
    }
    
    if (selectedNode) {
        selectedNode.material.emissiveIntensity = 0.3;
        selectedNode.scale.set(1, 1, 1);
        selectedNode = null;
    }
    
    document.getElementById('node-info').innerHTML = 'Tap on a node to see details';
    document.getElementById('node-info').style.display = 'block';
};

window.zoomIn = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.max(5, camera.position.z - 3);
    } else if (currentMode === 'ar' && graphGroup.visible) {
        const newScale = graphGroup.scale.x * 1.2;
        graphGroup.scale.setScalar(Math.max(0.1, Math.min(5, newScale)));
    }
};

window.zoomOut = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.min(100, camera.position.z + 3);
    } else if (currentMode === 'ar' && graphGroup.visible) {
        const newScale = graphGroup.scale.x * 0.8;
        graphGroup.scale.setScalar(Math.max(0.1, Math.min(5, newScale)));
    }
};

window.exitMode = function() {
    location.reload();
};

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Add this to help with mobile debugging
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }, 200);
});

// Add touch-friendly CSS for mobile controls
const mobileCSS = `
    #controls button {
        min-width: 50px;
        min-height: 50px;
        padding: 12px;
        margin: 8px;
        font-size: 18px;
        background: rgba(30, 30, 30, 0.9);
        border: 2px solid #4ecdc4;
        border-radius: 10px;
        color: white;
        cursor: pointer;
    }
    
    #controls button:hover, #controls button:active {
        background: rgba(78, 205, 196, 0.3);
    }
    
    #mode-indicator {
        font-size: 20px;
        padding: 12px;
        background: rgba(30, 30, 30, 0.9);
        border-radius: 8px;
        margin: 10px;
    }
    
    .legend-item {
        padding: 8px 12px;
        margin: 5px;
        font-size: 14px;
    }
`;

const styleEl = document.createElement('style');
styleEl.textContent = mobileCSS;
document.head.appendChild(styleEl);
