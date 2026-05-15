// Dữ liệu thiên văn vật lý dựa trên thông số của NASA
export const planetData = [
  {
    id: 'sun',
    name: 'Mặt Trời',
    type: 'star',
    radius: 25, // Nén tỷ lệ để cân bằng thị giác
    semiMajorAxis: 0, // AU
    orbitalPeriod: 1, // Tâm hệ
    eccentricity: 0,
    inclination: 0, // Độ
    axialTilt: 7.25, // Độ
    rotationPeriod: 609.12, // Giờ
    oblateness: 0.00005, // Độ dẹt
    textures: {
      albedo: '/textures/planets/sun/albedo.jpg'
    },
    atmosphere: null
  },
  {
    id: 'mercury',
    name: 'Sao Thủy',
    type: 'terrestrial',
    radius: 0.383, // Dựa trên Trái Đất = 1
    semiMajorAxis: 0.387,
    orbitalPeriod: 87.97, // Ngày Trái Đất
    eccentricity: 0.2056,
    inclination: 7.0,
    axialTilt: 0.034,
    rotationPeriod: 1407.6,
    oblateness: 0,
    textures: {
      albedo: '/textures/planets/mercury/albedo.jpg'
    },
    atmosphere: null
  },
  {
    id: 'venus',
    name: 'Sao Kim',
    type: 'terrestrial',
    radius: 0.949,
    semiMajorAxis: 0.723,
    orbitalPeriod: 224.7,
    eccentricity: 0.0068,
    inclination: 3.39,
    axialTilt: 177.4,
    rotationPeriod: -5832.5, // Quay ngược chiều
    oblateness: 0,
    textures: {
      albedo: '/textures/planets/venus/surface.jpg',
      atmosphere: '/textures/planets/venus/atmosphere.jpg'
    },
    atmosphere: {
      color: 0xFFA500,
      opacity: 0.9,
      power: 2.0
    }
  },
  {
    id: 'earth',
    name: 'Trái Đất',
    type: 'terrestrial',
    radius: 1.0,
    semiMajorAxis: 1.0,
    orbitalPeriod: 365.2,
    eccentricity: 0.0167,
    inclination: 0.0,
    axialTilt: 23.4,
    rotationPeriod: 23.93,
    oblateness: 0.00335,
    textures: {
      albedo: '/textures/planets/earth/albedo.jpg',
      normal: '/textures/planets/earth/normal.jpg',
      specular: '/textures/planets/earth/specular.jpg',
      night: '/textures/planets/earth/night.jpg',
      clouds: '/textures/planets/earth/clouds.jpg'
    },
    atmosphere: {
      color: 0x3B5B89,
      opacity: 0.6,
      power: 4.0
    }
  },
  {
    id: 'mars',
    name: 'Sao Hỏa',
    type: 'terrestrial',
    radius: 0.532,
    semiMajorAxis: 1.524,
    orbitalPeriod: 687.0,
    eccentricity: 0.0934,
    inclination: 1.85,
    axialTilt: 25.2,
    rotationPeriod: 24.62,
    oblateness: 0.00648,
    textures: {
      albedo: '/textures/planets/mars/albedo.jpg'
    },
    atmosphere: {
      color: 0xC06030,
      opacity: 0.2,
      power: 5.0
    }
  },
  {
    id: 'jupiter',
    name: 'Sao Mộc',
    type: 'gas-giant',
    radius: 11.21,
    semiMajorAxis: 5.203,
    orbitalPeriod: 4331,
    eccentricity: 0.0484,
    inclination: 1.31,
    axialTilt: 3.1,
    rotationPeriod: 9.93,
    oblateness: 0.06487, // Rất dẹt do quay nhanh
    textures: {
      albedo: '/textures/planets/jupiter/albedo.jpg'
    },
    atmosphere: null
  },
  {
    id: 'saturn',
    name: 'Sao Thổ',
    type: 'gas-giant',
    radius: 9.45,
    semiMajorAxis: 9.537,
    orbitalPeriod: 10747,
    eccentricity: 0.0542,
    inclination: 2.49,
    axialTilt: 26.7,
    rotationPeriod: 10.66,
    oblateness: 0.09796,
    textures: {
      albedo: '/textures/planets/saturn/albedo.jpg',
      ring: '/textures/planets/saturn/ring.png'
    },
    rings: {
      innerRadius: 1.2, // Tính theo tỷ lệ bán kính hành tinh
      outerRadius: 2.34,
      hasRings: true
    },
    atmosphere: {
      color: 0xC8A832,
      opacity: 0.15,
      power: 4.0
    }
  },
  {
    id: 'uranus',
    name: 'Sao Thiên Vương',
    type: 'ice-giant',
    radius: 4.01,
    semiMajorAxis: 19.19,
    orbitalPeriod: 30589,
    eccentricity: 0.0472,
    inclination: 0.77,
    axialTilt: 97.8, // Nằm ngang trên mặt phẳng quỹ đạo
    rotationPeriod: -17.24,
    oblateness: 0.02293,
    textures: {
      albedo: '/textures/planets/uranus/albedo.jpg',
      ring: '/textures/planets/uranus/ring.png'
    },
    rings: {
      innerRadius: 1.5,
      outerRadius: 2.01,
      hasRings: true
    },
    atmosphere: {
      color: 0x64B5C8,
      opacity: 0.4,
      power: 3.5
    }
  },
  {
    id: 'neptune',
    name: 'Sao Hải Vương',
    type: 'ice-giant',
    radius: 3.88,
    semiMajorAxis: 30.07,
    orbitalPeriod: 59800,
    eccentricity: 0.0086,
    inclination: 1.77,
    axialTilt: 28.3,
    rotationPeriod: 16.11,
    oblateness: 0.01708,
    textures: {
      albedo: '/textures/planets/neptune/albedo.jpg'
    },
    atmosphere: {
      color: 0x3264C8,
      opacity: 0.5,
      power: 3.5
    }
  },
  {
    id: 'pluto',
    name: 'Sao Diêm Vương',
    type: 'dwarf',
    radius: 0.186,
    semiMajorAxis: 39.48,
    orbitalPeriod: 90560,
    eccentricity: 0.2444,
    inclination: 17.2,
    axialTilt: 122.5,
    rotationPeriod: -153.3,
    oblateness: 0,
    textures: {
      albedo: '/textures/planets/pluto/albedo.jpg'
    },
    atmosphere: null
  }
];
