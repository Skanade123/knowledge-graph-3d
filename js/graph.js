// graph.js - Using 3d-force-graph library
let Graph;
let graphData = { nodes: [], links: [] };

const nodeColors = {
    'Document': '#ff6b6b',
    'Chunk': '#4ecdc4',
    'default': '#45b7d1'
};

// Initialize on page load
window.addEventListener('load', () => {
    loadGraphData();
});

async function loadGraphData() {
    try {
        const response = await fetch('./Data/knowledge-graph.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Hide loading screen
        document.getElementById('loading-screen').style.display = 'none';
        
        // Transform data and initialize graph
        transformAndInitGraph(data);
    } catch (error) {
        console.error('Error loading graph data:', error);
        document.getElementById('loading-screen').innerHTML = `
            <div style="color: white; text-align: center;">
                <h2>❌ Error Loading Data</h2>
                <p>${error.message}</p>
                <p style="margin-top: 20px;">Make sure your JSON file is in the Data folder</p>
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

function transformAndInitGraph(data) {
    const entities = data.entities || [];
    const relationships = data.relationships || [];

    // Transform entities to nodes
    const nodes = entities.map(entity => ({
        id: entity.id,
        label: entity.label,
        type: entity.type,
        properties: entity.properties,
        source_doc: entity.source_doc,
        color: nodeColors[entity.type] || nodeColors.default,
        val: entity.type === 'Document' ? 8 : 4 // Size based on type
    }));

    // Transform relationships to links
    let links = [];
    
    if (relationships && relationships.length > 0) {
        // If relationships exist in JSON, use them
        links = relationships.map(rel => ({
            source: rel.source,
            target: rel.target,
            type: rel.type || 'connects'
        }));
    } else {
        // Auto-create links based on document_id in properties
        // Connect chunks to their parent document
        entities.forEach(entity => {
            if (entity.properties && entity.properties.document_id) {
                links.push({
                    source: entity.properties.document_id,
                    target: entity.id,
                    type: 'contains'
                });
            }
        });
        
        // Connect sequential chunks
        const chunksByDoc = {};
        entities.forEach(entity => {
            if (entity.type === 'Chunk' && entity.properties && entity.properties.document_id) {
                const docId = entity.properties.document_id;
                if (!chunksByDoc[docId]) {
                    chunksByDoc[docId] = [];
                }
                chunksByDoc[docId].push(entity);
            }
        });
        
        // Sort chunks by index and connect them sequentially
        Object.values(chunksByDoc).forEach(chunks => {
            chunks.sort((a, b) => {
                const indexA = a.properties.chunk_index || 0;
                const indexB = b.properties.chunk_index || 0;
                return indexA - indexB;
            });
            
            for (let i = 0; i < chunks.length - 1; i++) {
                links.push({
                    source: chunks[i].id,
                    target: chunks[i + 1].id,
                    type: 'next'
                });
            }
        });
    }

    graphData = { nodes, links };

    console.log('Loaded nodes:', nodes.length);
    console.log('Loaded links:', links.length);
    console.log('Node types:', [...new Set(nodes.map(n => n.type))]);

    // Update stats
    document.getElementById('node-count').textContent = nodes.length;
    document.getElementById('link-count').textContent = links.length;

    // Initialize the graph
    initGraph();
}

function initGraph() {
    const container = document.getElementById('3d-graph');
    
    Graph = ForceGraph3D()(container)
        .graphData(graphData)
        .nodeLabel('label')
        .nodeColor(node => node.color)
        .nodeVal(node => node.val)
        .nodeOpacity(0.9)
        .linkColor(() => 'rgba(255, 255, 255, 0.2)')
        .linkWidth(1)
        .linkOpacity(0.4)
        .linkDirectionalParticles(2)
        .linkDirectionalParticleWidth(2)
        .linkDirectionalParticleSpeed(0.005)
        .backgroundColor('#0a0a0a')
        .onNodeClick(handleNodeClick)
        .onNodeHover(handleNodeHover)
        .enableNodeDrag(true)
        .enableNavigationControls(true)
        .showNavInfo(false);

    // Configure camera controls
    const controls = Graph.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 2000;

    // Set initial camera position
    Graph.cameraPosition({ z: 400 });

    // Add warmup ticks for better initial layout
    Graph.d3Force('charge').strength(-120);
    Graph.d3Force('link').distance(50);
    
    // Let the graph settle
    for (let i = 0; i < 100; i++) {
        Graph.tickFrame();
    }
}

function handleNodeClick(node) {
    if (!node) return;

    // Highlight the clicked node
    highlightNode(node);
    
    // Display node information
    displayNodeInfo(node);
    
    // Zoom to node with smooth animation
    const distance = 200;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    
    Graph.cameraPosition(
        {
            x: node.x * distRatio,
            y: node.y * distRatio,
            z: node.z * distRatio
        },
        node,
        1000 // Animation duration in ms
    );
}

function handleNodeHover(node) {
    const container = document.getElementById('3d-graph');
    container.style.cursor = node ? 'pointer' : 'grab';
}

function highlightNode(node) {
    // Reset all nodes
    graphData.nodes.forEach(n => {
        n.__threeObj && n.__threeObj.scale.set(1, 1, 1);
    });

    // Highlight selected node
    if (node.__threeObj) {
        node.__threeObj.scale.set(1.5, 1.5, 1.5);
    }
}

function displayNodeInfo(node) {
    let html = `
        <div style="margin-bottom: 10px;">
            <strong>Type:</strong> 
            <span style="color: ${node.color}; font-weight: 600;">${node.type}</span>
        </div>
        <div style="margin-bottom: 10px;">
            <strong>ID:</strong> 
            <span style="font-size: 0.85em; color: #999; word-break: break-all;">${node.id}</span>
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Label:</strong> ${node.label}
        </div>
    `;

    if (node.source_doc) {
        html += `
            <div style="margin-bottom: 10px;">
                <strong>Source:</strong> ${node.source_doc}
            </div>
        `;
    }

    if (node.properties && Object.keys(node.properties).length > 0) {
        html += '<div style="margin-top: 15px;"><strong>Properties:</strong></div>';
        for (const [key, value] of Object.entries(node.properties)) {
            let displayValue;
            if (Array.isArray(value)) {
                displayValue = value.join(', ');
            } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value, null, 2);
            } else {
                displayValue = value;
            }
            html += `<div class="property"><strong>${key}:</strong> ${displayValue}</div>`;
        }
    }

    // Find connected nodes
    const connectedLinks = graphData.links.filter(
        link => link.source.id === node.id || link.target.id === node.id
    );
    
    if (connectedLinks.length > 0) {
        html += `<div style="margin-top: 15px;"><strong>Connections:</strong> ${connectedLinks.length}</div>`;
    }

    document.getElementById('node-info').innerHTML = html;
}

function resetView() {
    Graph.cameraPosition(
        { x: 0, y: 0, z: 400 },
        { x: 0, y: 0, z: 0 },
        1000
    );
    
    // Reset all node scales
    graphData.nodes.forEach(n => {
        if (n.__threeObj) {
            n.__threeObj.scale.set(1, 1, 1);
        }
    });

    document.getElementById('node-info').innerHTML = 'Click on a node to see details';
}

function zoomToFit() {
    Graph.zoomToFit(1000, 50);
}

async function reloadData() {
    document.getElementById('loading-screen').style.display = 'flex';
    
    // Clear existing graph
    if (Graph) {
        Graph.graphData({ nodes: [], links: [] });
    }
    
    // Reload data
    await loadGraphData();
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
        resetView();
    } else if (event.key === 'f' || event.key === 'F') {
        zoomToFit();
    } else if (event.key === 'Escape') {
        resetView();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (Graph) {
        Graph.width(window.innerWidth);
        Graph.height(window.innerHeight);
    }
});
