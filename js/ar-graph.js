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
        const response = await fetch('/api/graph-data');
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

    // Touch controls for AR
    setupARControls();

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

    // Start animation
    animate3D();

    document.getElementById('mode-indicator').textContent = '🖥️ 3D Mode';
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
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onARSelect);
    scene.add(controller);
}

function onARSelect() {
    if (reticle.visible && !graphGroup.visible) {
        // Place the graph
        graphGroup.position.setFromMatrixPosition(reticle.matrix);
        graphGroup.visible = true;
        document.getElementById('ar-instructions').style.display = 'none';
    }
}

function setup3DControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

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

    renderer.domElement.addEventListener('click', onNodeClick);

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.01;
        camera.position.z = Math.max(5, Math.min(100, camera.position.z));
    });

    // Touch controls
    let touchStartDistance = 0;

    renderer.domElement.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (touchStartDistance) {
                const delta = distance - touchStartDistance;
                camera.position.z -= delta * 0.01;
                camera.position.z = Math.max(5, Math.min(100, camera.position.z));
            }
            
            touchStartDistance = distance;
        } else if (e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;

            graphGroup.rotation.y += deltaX * 0.01;
            graphGroup.rotation.x += deltaY * 0.01;

            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });

    renderer.domElement.addEventListener('touchend', () => {
        touchStartDistance = 0;
    });

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });
}

function onNodeClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodes);

    if (selectedNode) {
        selectedNode.material.emissiveIntensity = 0.3;
        selectedNode.scale.set(1, 1, 1);
    }

    if (intersects.length > 0) {
        selectedNode = intersects[0].object;
        selectedNode.material.emissiveIntensity = 0.6;
        selectedNode.scale.set(1.3, 1.3, 1.3);
        displayNodeInfo(selectedNode.userData);
    }
}

function displayNodeInfo(data) {
    let html = `
        <div style="margin-bottom: 10px;">
            <strong>Type:</strong> ${data.type}
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Label:</strong> ${data.label}
        </div>
    `;

    if (data.source_doc) {
        html += `<div style="margin-bottom: 10px;"><strong>Source:</strong> ${data.source_doc}</div>`;
    }

    if (data.properties) {
        html += '<div style="margin-top: 10px;"><strong>Properties:</strong></div>';
        for (const [key, value] of Object.entries(data.properties)) {
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            html += `<div class="property"><strong>${key}:</strong> ${displayValue}</div>`;
        }
    }

    document.getElementById('node-info').innerHTML = html;
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
    nodes.forEach(node => {
        node.rotation.x += 0.001;
        node.rotation.y += 0.001;
    });

    renderer.render(scene, camera);
}

function showUI() {
    document.getElementById('info-panel').style.display = 'block';
    document.getElementById('stats').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';
    if (currentMode === '3d') {
        document.querySelector('.legend').style.display = 'block';
    }
}

window.resetView = function() {
    if (currentMode === '3d') {
        camera.position.set(0, 0, 30);
        graphGroup.rotation.set(0, 0, 0);
    }
    
    nodes.forEach(n => {
        n.material.emissiveIntensity = 0.3;
        n.scale.set(1, 1, 1);
    });
    
    document.getElementById('node-info').innerHTML = 'Click on a node to see details';
};

window.zoomIn = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.max(5, camera.position.z - 3);
    } else if (currentMode === 'ar') {
        graphGroup.scale.multiplyScalar(1.2);
    }
};

window.zoomOut = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.min(100, camera.position.z + 3);
    } else if (currentMode === 'ar') {
        graphGroup.scale.multiplyScalar(0.8);
    }
};

window.exitMode = function() {
    location.reload();
};

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
