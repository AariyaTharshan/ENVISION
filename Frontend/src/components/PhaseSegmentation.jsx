import React, { useState, useEffect, useRef } from 'react';
import { Button, Select, Input, Slider, Switch, Space, message, Table, Tabs, Card, Divider, Typography } from 'antd';
import { DownOutlined, PlusOutlined, SaveOutlined, SettingOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const { TabPane } = Tabs;
const { Option } = Select;
const { Title } = Typography;

// Simple Image Icon component
const ImageIcon = () => (
    <svg 
        viewBox="0 0 24 24" 
        width="24" 
        height="24" 
        stroke="currentColor" 
        strokeWidth="2" 
        fill="none" 
        strokeLinecap="round" 
        strokeLinejoin="round"
    >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
    </svg>
);

const PhaseSegmentation = ({ imagePath, imageUrl, onClose }) => {
    const navigate = useNavigate();
    const [method, setMethod] = useState('area_fraction'); // 'area_fraction' or 'point_count'
    const [currentConfig, setCurrentConfig] = useState('');
    const [configurations, setConfigurations] = useState({});
    const [currentPhase, setCurrentPhase] = useState(null);
    const [phases, setPhases] = useState([]);
    const [selectedColor, setSelectedColor] = useState('#ff0000');
    const [colorMode, setColorMode] = useState('rgb'); // 'rgb' or 'hsv'
    const [detectionMode, setDetectionMode] = useState('auto'); // 'auto' or 'manual'
    const [boundaries, setBoundaries] = useState([]);
    const [results, setResults] = useState([]);
    const [summaryResults, setSummaryResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [displayUrl, setDisplayUrl] = useState(null);
    const [selectedRange, setSelectedRange] = useState({ start: 0, end: 255 });
    const [imageData, setImageData] = useState(null);
    const canvasRef = useRef(null);
    const graphCanvasRef = useRef(null);
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragHandleRef = useRef(null); // 'start' or 'end'
    const rgbHistogramRef = useRef(null);

    // Color range states
    const [rgbRange, setRgbRange] = useState({
        r: [0, 255],
        g: [0, 255],
        b: [0, 255]
    });

    const [hsvRange, setHsvRange] = useState({
        h: [0, 360],
        s: [0, 100],
        v: [0, 100]
    });

    // Shape filter states
    const [shapeFilters, setShapeFilters] = useState({
        circularity: { enabled: false, start: 0, end: 1 },
        length: { enabled: false, min: 0, max: 100 },
        width: { enabled: false, min: 0, max: 100 }
    });

    const [histogramData, setHistogramData] = useState(null);
    const imageRef = useRef(null);
    const [imageScale, setImageScale] = useState(1);
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        fetchConfigurations();
    }, []);

    useEffect(() => {
        if (imageUrl) {
            setDisplayUrl(imageUrl);
        }
    }, [imageUrl]);

    useEffect(() => {
        if (displayUrl) {
            loadImage(displayUrl);
        }
    }, [displayUrl]);

    useEffect(() => {
        if (!imageData || !rgbHistogramRef.current) return;

        // Calculate histograms
        const rHist = new Array(256).fill(0);
        const gHist = new Array(256).fill(0);
        const bHist = new Array(256).fill(0);

        for (let i = 0; i < imageData.data.length; i += 4) {
            rHist[imageData.data[i]]++;
            gHist[imageData.data[i + 1]]++;
            bHist[imageData.data[i + 2]]++;
        }

        // Normalize
        const max = Math.max(...rHist, ...gHist, ...bHist);

        // Draw
        const canvas = rgbHistogramRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawLine = (hist, color) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            for (let x = 0; x < 256; x++) {
                const y = canvas.height - (hist[x] / max) * canvas.height;
                if (x === 0) ctx.moveTo(x * (canvas.width / 256), y);
                else ctx.lineTo(x * (canvas.width / 256), y);
            }
            ctx.stroke();
        };

        drawLine(rHist, 'red');
        drawLine(gHist, 'green');
        drawLine(bHist, 'blue');
    }, [imageData]);

    const fetchConfigurations = async () => {
        try {
            const response = await axios.get('/api/phase/get-configurations');
            if (response.data.status === 'success') {
                setConfigurations(response.data.configurations || {});
            }
        } catch (error) {
            message.error('Failed to load configurations');
        }
    };

    const handleNewPhase = () => {
        setCurrentPhase({
            name: '',
            color: selectedColor,
            colorMode: colorMode,
            detectionMode: detectionMode,
            colorRange: colorMode === 'rgb' ? rgbRange : hsvRange,
            boundaries: [],
            shapeFilters: { ...shapeFilters }
        });
    };

    const handlePhaseNameChange = (name) => {
        setCurrentPhase(prev => ({ ...prev, name }));
    };

    const handleColorModeChange = (mode) => {
        setColorMode(mode);
        setCurrentPhase(prev => ({
            ...prev,
            colorMode: mode,
            colorRange: mode === 'rgb' ? rgbRange : hsvRange
        }));
    };

    const handleDetectionModeChange = (mode) => {
        setDetectionMode(mode);
        setCurrentPhase(prev => ({ ...prev, detectionMode: mode }));
    };

    const handleColorRangeChange = (type, range) => {
        if (colorMode === 'rgb') {
            setRgbRange(prev => ({ ...prev, [type]: range }));
        } else {
            setHsvRange(prev => ({ ...prev, [type]: range }));
        }
        
        setCurrentPhase(prev => ({
            ...prev,
            colorRange: colorMode === 'rgb' ? 
                { ...rgbRange, [type]: range } :
                { ...hsvRange, [type]: range }
        }));
    };

    const handleShapeFilterChange = (type, values) => {
        setShapeFilters(prev => ({
            ...prev,
            [type]: { ...prev[type], ...values }
        }));
        
        setCurrentPhase(prev => ({
            ...prev,
            shapeFilters: {
                ...prev.shapeFilters,
                [type]: { ...prev.shapeFilters[type], ...values }
            }
        }));
    };

    const handleSavePhase = async () => {
        if (!currentPhase?.name) {
            message.error('Please enter a phase name');
            return;
        }

        if (!imagePath) {
            message.error('Please select an image first');
            return;
        }

        const newPhases = [...phases, currentPhase];
        setPhases(newPhases);

        try {
            setLoading(true);
            setError(null);

            const response = await axios.post('/api/phase/analyze', {
                image_path: imagePath,
                configuration: { phases: [currentPhase] }
            });

            if (response.data.status === 'success') {
                const result = response.data.results[currentPhase.name];
                setResults(prev => [...prev, {
                    ...currentPhase,
                    result: result.percentage
                }]);
                message.success('Phase analysis completed successfully');
            } else {
                message.error('Failed to analyze phase: ' + (response.data.message || 'Unknown error'));
            }
        } catch (error) {
            setError(error.response?.data?.message || 'Failed to analyze phase');
            message.error('Failed to analyze phase');
        } finally {
            setLoading(false);
        }

        setCurrentPhase(null);
    };

    const handleSaveConfiguration = async () => {
        try {
            const response = await axios.post('/api/phase/save-configuration', {
                name: `Config_${Date.now()}`,
                configuration: {
                    method,
                    phases
                }
            });
            
            if (response.data.status === 'success') {
                message.success('Configuration saved successfully');
                fetchConfigurations();
            }
        } catch (error) {
            message.error('Failed to save configuration');
        }
    };

    const handleApplyConfiguration = async (configName) => {
        try {
            const response = await axios.post('/api/phase/apply-configuration', {
                name: configName
            });
            
            if (response.data.status === 'success') {
                const config = response.data.configuration;
                setMethod(config.method);
                setPhases(config.phases);
                
                // Re-analyze with loaded configuration
                const analysisResponse = await axios.post('/api/phase/analyze', {
                    image_path: imagePath,
                    configuration: {
                        phases: config.phases
                    }
                });

                if (analysisResponse.data.status === 'success') {
                    setResults(
                        config.phases.map(phase => ({
                            ...phase,
                            result: analysisResponse.data.results[phase.name].percentage
                        }))
                    );
                }
            }
        } catch (error) {
            message.error('Failed to apply configuration');
        }
    };

    const handleAddToSummary = () => {
        setSummaryResults(prev => [...prev, ...results]);
    };

    const loadImage = (url) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
            // Create canvas for image processing
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Get image data for processing
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            setImageData(imgData);

            // Generate and draw intensity graph
            generateIntensityGraph(imgData);

            // Set up canvas for displaying processed image
            if (canvasRef.current) {
                const displayCtx = canvasRef.current.getContext('2d');
                canvasRef.current.width = img.naturalWidth;
                canvasRef.current.height = img.naturalHeight;
                displayCtx.drawImage(img, 0, 0);
            }

            // Update image dimensions
            setImageDimensions({
                width: img.naturalWidth,
                height: img.naturalHeight
            });

            // Calculate appropriate scale
            const maxWidth = 800;
            const maxHeight = 600;
            let scale = 1;
            
            if (img.naturalWidth > maxWidth || img.naturalHeight > maxHeight) {
                const widthScale = maxWidth / img.naturalWidth;
                const heightScale = maxHeight / img.naturalHeight;
                scale = Math.min(widthScale, heightScale);
            }
            
            setImageScale(scale);
        };

        img.onerror = (error) => {
            console.error('Error loading image:', error);
            setError('Failed to load image');
        };

        img.src = url;
    };

    const generateIntensityGraph = (imgData) => {
        const data = imgData.data;
        const intensities = new Array(256).fill(0);

        // Calculate intensity values
        for (let i = 0; i < data.length; i += 4) {
            const intensity = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            intensities[intensity]++;
        }

        drawGraph(intensities);
    };

    const drawGraph = (intensities) => {
        const canvas = graphCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const maxIntensity = Math.max(...intensities);

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);

        // Draw graph line
        ctx.beginPath();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        for (let i = 0; i < intensities.length; i++) {
            const x = (i / 255) * width;
            const y = height - (intensities[i] / maxIntensity) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw selected range
        const startX = (selectedRange.start / 255) * width;
        const endX = (selectedRange.end / 255) * width;

        // Draw selected range background
        ctx.fillStyle = `${selectedColor}40`;
        ctx.fillRect(startX, 0, endX - startX, height);

        // Draw handles
        drawHandle(ctx, startX, height, 'start');
        drawHandle(ctx, endX, height, 'end');
    };

    const drawHandle = (ctx, x, height, type) => {
        ctx.fillStyle = selectedColor;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        // Draw handle line
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw handle grip
        ctx.beginPath();
        ctx.arc(x, height - 10, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    };

    const handleMouseDown = (e) => {
        const canvas = graphCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = canvas.width;

        // Check if click is near handles
        const startX = (selectedRange.start / 255) * width;
        const endX = (selectedRange.end / 255) * width;
        const threshold = 10;

        if (Math.abs(x - startX) < threshold) {
            isDraggingRef.current = true;
            dragHandleRef.current = 'start';
        } else if (Math.abs(x - endX) < threshold) {
            isDraggingRef.current = true;
            dragHandleRef.current = 'end';
        }

        dragStartXRef.current = x;
    };

    const handleMouseMove = (e) => {
        if (!isDraggingRef.current) return;

        const canvas = graphCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = canvas.width;

        const newValue = Math.max(0, Math.min(255, Math.round((x / width) * 255)));

        if (dragHandleRef.current === 'start') {
            if (newValue < selectedRange.end) {
                setSelectedRange(prev => ({ ...prev, start: newValue }));
            }
        } else {
            if (newValue > selectedRange.start) {
                setSelectedRange(prev => ({ ...prev, end: newValue }));
            }
        }

        if (imageData) {
            applyColorHighlight();
        }
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        dragHandleRef.current = null;
    };

    const applyColorHighlight = () => {
        if (!imageData || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const newImageData = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );

        for (let i = 0; i < newImageData.data.length; i += 4) {
            const intensity = Math.round(
                (newImageData.data[i] + newImageData.data[i + 1] + newImageData.data[i + 2]) / 3
            );

            if (intensity >= selectedRange.start && intensity <= selectedRange.end) {
                // Convert selected color to RGB
                const r = parseInt(selectedColor.slice(1, 3), 16);
                const g = parseInt(selectedColor.slice(3, 5), 16);
                const b = parseInt(selectedColor.slice(5, 7), 16);

                // Apply selected color with some transparency
                newImageData.data[i] = r;
                newImageData.data[i + 1] = g;
                newImageData.data[i + 2] = b;
                newImageData.data[i + 3] = 200; // Some transparency
            }
        }

        ctx.putImageData(newImageData, 0, 0);
    };

    const columns = [
        {
            title: '#',
            dataIndex: 'index',
            key: 'index',
            render: (_, __, index) => index + 1
        },
        {
            title: 'Color',
            dataIndex: 'color',
            key: 'color',
            render: color => (
                <div
                    style={{
                        width: 20,
                        height: 20,
                        backgroundColor: color,
                        border: '1px solid #d9d9d9'
                    }}
                />
            )
        },
        {
            title: 'Element',
            dataIndex: 'name',
            key: 'name'
        },
        {
            title: 'Area',
            dataIndex: 'result',
            key: 'result',
            render: value => `${value?.toFixed(2)}%`
        }
    ];

    // Add image load handler
    const handleImageLoad = () => {
        if (imageRef.current) {
            const { naturalWidth, naturalHeight } = imageRef.current;
            const maxWidth = 800;
            const maxHeight = 600;
            
            let scale = 1;
            if (naturalWidth > maxWidth || naturalHeight > maxHeight) {
                const widthScale = maxWidth / naturalWidth;
                const heightScale = maxHeight / naturalHeight;
                scale = Math.min(widthScale, heightScale);
            }
            
            setImageScale(scale);
            setImageDimensions({
                width: naturalWidth * scale,
                height: naturalHeight * scale
            });
            
            // Generate histogram after image loads
            generateIntensityGraph(imageData);
        }
    };

    const handleBack = () => {
        window.history.back();
    };

    return (
        <div className="fixed inset-0 bg-white flex flex-col">
            {/* Top Navigation Bar */}
            <div className="h-14 bg-gray-100 flex items-center px-4 border-b border-gray-200">
                <button 
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
                >
                    <ArrowLeftOutlined />
                    <span>Close</span>
                </button>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <div className="w-[300px] bg-white border-r border-gray-200 overflow-y-auto">
                    <div className="p-4 space-y-6">
                        {/* Analysis Method */}
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 mb-2">Analysis Method</h3>
                            <Select
                                value={method}
                                onChange={setMethod}
                                className="w-full"
                            >
                                <Option value="area_fraction">Area Fraction Method</Option>
                                <Option value="point_count">Manual Point Count Method</Option>
                            </Select>
                        </div>

                        {/* Saved Configurations */}
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 mb-2">Saved Configurations</h3>
                            <Select
                                value={currentConfig}
                                onChange={handleApplyConfiguration}
                                className="w-full"
                                placeholder="Select Configuration"
                            >
                                {Object.entries(configurations).map(([name]) => (
                                    <Option key={name} value={name}>{name}</Option>
                                ))}
                            </Select>
                        </div>

                        {/* New Phase Button */}
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleNewPhase}
                            block
                        >
                            New Phase
                        </Button>

                        {/* Phase Configuration */}
                        {currentPhase && (
                            <div className="mt-6 border-t border-gray-200 pt-6">
                                <h3 className="text-sm font-medium text-gray-900 mb-4">Phase Configuration</h3>
                                <div className="space-y-4">
                                    <Input
                                        placeholder="Enter Element Name"
                                        value={currentPhase.name}
                                        onChange={e => handlePhaseNameChange(e.target.value)}
                                        className="w-full"
                                    />

                                    {/* Color Selection Card */}
                                    <Card className="w-full bg-white shadow-sm">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="color"
                                                    value={selectedColor}
                                                    onChange={(e) => setSelectedColor(e.target.value)}
                                                    className="w-10 h-10 p-1 rounded border border-gray-200"
                                                />
                                                <span className="text-sm text-gray-600">Selected Color</span>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-gray-600">Color Mode</span>
                                                    <Switch
                                                        checked={colorMode === 'hsv'}
                                                        onChange={checked => handleColorModeChange(checked ? 'hsv' : 'rgb')}
                                                        checkedChildren="HSV"
                                                        unCheckedChildren="RGB"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Color Controls */}
                                    <Card className="w-full bg-white shadow-sm">
                                        <h4 className="text-sm font-medium mb-4">
                                            {colorMode === 'rgb' ? 'RGB Controls' : 'HSV Controls'}
                                        </h4>
                                        {colorMode === 'rgb' && (
                                            <div className="space-y-4">
                                                <div className="mb-2">
                                                    <canvas ref={rgbHistogramRef} width={256} height={100} className="w-full border rounded bg-white" />
                                                    <div className="flex justify-center gap-4 mt-2">
                                                        <span className="text-sm text-red-600 font-semibold">R</span>
                                                        <span className="text-sm text-green-600 font-semibold">G</span>
                                                        <span className="text-sm text-blue-600 font-semibold">B</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </Card>

                                    {/* Save Phase Button */}
                                    <Button
                                        type="primary"
                                        icon={<SaveOutlined />}
                                        onClick={handleSavePhase}
                                        loading={loading}
                                        block
                                    >
                                        Save Phase
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-white overflow-y-auto">
                    <div className="p-6">
                        {/* Image Display */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                            {displayUrl ? (
                                <div className="flex flex-col items-center">
                                    <div className="w-full max-h-[600px] overflow-hidden flex justify-center items-center">
                                        <img
                                            ref={imageRef}
                                            src={displayUrl}
                                            alt="Analysis"
                                            onLoad={handleImageLoad}
                                            className="max-w-full max-h-[600px] object-contain"
                                            crossOrigin="anonymous"
                                        />
                                    </div>
                                    <div className="mt-4 w-full">
                                        <h4 className="text-sm font-medium text-gray-900 mb-2">Color Distribution</h4>
                                        <canvas
                                            ref={graphCanvasRef}
                                            width={400}
                                            height={150}
                                            className="w-full border border-gray-200 rounded-lg bg-white"
                                        />
                                        <div className="flex justify-center gap-4 mt-2">
                                            <span className="text-sm text-gray-600">
                                                <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>
                                                Red
                                            </span>
                                            <span className="text-sm text-gray-600">
                                                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>
                                                Green
                                            </span>
                                            <span className="text-sm text-gray-600">
                                                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1"></span>
                                                Blue
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg">
                                    <div className="text-center text-gray-500">
                                        <div className="mb-2">No image selected</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Results Table */}
                        <div className="bg-white border border-gray-200 rounded-lg">
                            <Tabs defaultActiveKey="current" className="px-4">
                                <TabPane tab="Current Result" key="current">
                                    <div className="p-4">
                                        <Table
                                            dataSource={results}
                                            columns={columns}
                                            pagination={false}
                                            size="small"
                                            className="border border-gray-200 rounded-lg"
                                        />
                                        <Button
                                            icon={<DownOutlined />}
                                            onClick={handleAddToSummary}
                                            className="mt-4"
                                            type="primary"
                                            ghost
                                        >
                                            Add to Summary
                                        </Button>
                                    </div>
                                </TabPane>
                                <TabPane tab="Overall Summary" key="summary">
                                    <div className="p-4">
                                        <Table
                                            dataSource={summaryResults}
                                            columns={columns}
                                            pagination={false}
                                            size="small"
                                            className="border border-gray-200 rounded-lg"
                                        />
                                    </div>
                                </TabPane>
                            </Tabs>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PhaseSegmentation; 