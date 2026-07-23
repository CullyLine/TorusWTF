'use client';

/**
 * Rainforest Reverie — Inigo Quilez's "Rainforest"
 * (https://www.shadertoy.com/view/4ttSWf), ported with the author's
 * permission (obtained by the project owner, July 2026). The original
 * copyright notice is preserved inside the shader source below; this file
 * may not be reused outside the permission granted for this project.
 *
 * The original two-pass Shadertoy structure is preserved:
 *  - Buffer A raymarches terrain, ellipsoid trees, and volumetric clouds,
 *    smoothing the result with temporal reprojection (self-feedback).
 *  - The Image pass composites Buffer A with a vignette.
 * Buffer A renders into a half-float ping-pong target pair at a tier-scaled
 * resolution; the visible fullscreen triangle runs the Image pass.
 *
 * Every deviation from the original source is tagged with a [TorusFM]
 * comment. Musical anatomy (all hooks additive, none rewrite the art):
 *  - bass → fog breathes deeper, the camera leans down-valley
 *  - kick → instant exposure pop in the Image pass
 *  - mids / swell → wind stirs the foliage noise, the gaze lifts
 *  - hat → spec glitter rolls across the canopy
 *  - gather / silence → fog thickens; silence also desaturates gently
 *  - release / drop → fog burns off, sun bursts through the clouds
 *  - afterglow → the palette wash warms slightly
 *
 * Controls: speed → shader clock; scale → focal zoom; turbulence → wind and
 * cloud drift; density → deterministic tree clearings.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisualizerSceneProps } from '../registry';
import { useMetricsRef } from '../metrics';
import { useModulation } from '../modulation';
import {
  bufferSizeFor,
  getRainforestPortConfig,
  type RainforestPortConfig,
  type RainforestTier,
} from './rainforestData';

const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

const ORIGINAL_NOTICE = /* glsl */ `
// Copyright Inigo Quilez, 2016 - https://iquilezles.org/
// I am the sole copyright owner of this Work.
// You cannot host, display, distribute or share this Work neither
// as it is or altered, here on Shadertoy or anywhere else, in any
// form including physical and digital. You cannot use this Work in any
// commercial or non-commercial product, website or project. You cannot
// sell this Work and you cannot mint an NFTs of it or train a neural
// network with it without permission. I share this Work for educational
// purposes, and you can link to it, through an URL, proper attribution
// and unmodified screenshot, as part of your educational material. If
// these conditions are too restrictive please contact me and we'll
// definitely work it out.
//
// [TorusFM] This port is used with the author's permission, obtained by
// the TorusFM project owner (July 2026).

// A rainforest landscape.
//
// Tutorial on Youtube : https://www.youtube.com/watch?v=BFld4EBO2RE
// Tutorial on Bilibili: https://www.bilibili.com/video/BV1Da4y1q78H
//
// Normals are analytical (true derivatives) for the terrain and for the
// clouds, including the noise, the fbm and the smoothsteps.
//
// Lighting and art composed for this shot/camera. The trees are really
// ellipsoids with noise, but they kind of do the job in distance and low
// image resolutions Also I used some basic reprojection technique to
// smooth out the render.
//
// See here for more info:
//  https://iquilezles.org/articles/fbm
//  https://iquilezles.org/articles/morenoise
`;

function buildBufferShader(config: RainforestPortConfig): string {
  return /* glsl */ `
${ORIGINAL_NOTICE}

#define LOWQUALITY

// [TorusFM] Shadertoy adapter — channels/time/frame arrive as uniforms.
uniform sampler2D iChannel0;
uniform vec3 iResolution;
uniform float uTime;
uniform int uFrame;
#define iTime uTime
#define iFrame uFrame

// [TorusFM] tier budgets compiled as loop caps (original values on high).
#define CLOUD_STEPS ${config.cloudSteps}
#define TERRAIN_STEPS ${config.terrainSteps}
#define TREE_STEPS ${config.treeSteps}
#define TERRAIN_SHADOW_STEPS ${config.terrainShadowSteps}
#define TREE_SHADOW_STEPS ${config.treeShadowSteps}

// [TorusFM] audio-reactive inputs, smoothed on the CPU.
uniform float uZoom;      // scale control → focal length
uniform float uFogMul;    // bass/gather breathe the fog, surge burns it off
uniform float uCamPush;   // bass leans the camera down-valley
uniform float uCamLift;   // swell lifts the gaze
uniform vec3 uWindPhase;  // mids/turbulence stir the foliage noise field
uniform float uCloudTime; // cloud drift clock (turbulence/energy scaled)
uniform float uSurge;     // release/drop → sun bursts through the clouds
uniform float uHat;       // hats → spec glitter across the canopy
uniform float uTreeKeep;  // density control → deterministic clearings
// [TorusFM] previous-frame camera rows for reprojection (see main image).
uniform vec4 uOldCam0;
uniform vec4 uOldCam1;
uniform vec4 uOldCam2;

//==========================================================================================
// general utilities
//==========================================================================================
#define ZERO (min(iFrame,0))

float sdEllipsoidY( in vec3 p, in vec2 r )
{
    float k0 = length(p/r.xyx);
    float k1 = length(p/(r.xyx*r.xyx));
    return k0*(k0-1.0)/k1;
}
float sdEllipsoid( in vec3 p, in vec3 r )
{
    float k0 = length(p/r);
    float k1 = length(p/(r*r));
    return k0*(k0-1.0)/k1;
}

// return smoothstep and its derivative
vec2 smoothstepd( float a, float b, float x)
{
	if( x<a ) return vec2( 0.0, 0.0 );
	if( x>b ) return vec2( 1.0, 0.0 );
    float ir = 1.0/(b-a);
    x = (x-a)*ir;
    return vec2( x*x*(3.0-2.0*x), 6.0*x*(1.0-x)*ir );
}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr )
{
	vec3 cw = normalize(ta-ro);
	vec3 cp = vec3(sin(cr), cos(cr),0.0);
	vec3 cu = normalize( cross(cw,cp) );
	vec3 cv = normalize( cross(cu,cw) );
    return mat3( cu, cv, cw );
}

//==========================================================================================
// hashes (low quality, do NOT use in production)
//==========================================================================================

float hash1( vec2 p )
{
    p  = 50.0*fract( p*0.3183099 );
    return fract( p.x*p.y*(p.x+p.y) );
}

float hash1( float n )
{
    return fract( n*17.0*fract( n*0.3183099 ) );
}

vec2 hash2( vec2 p ) 
{
    const vec2 k = vec2( 0.3183099, 0.3678794 );
    float n = 111.0*p.x + 113.0*p.y;
    return fract(n*fract(k*n));
}

//==========================================================================================
// noises
//==========================================================================================

// value noise, and its analytical derivatives
vec4 noised( in vec3 x )
{
    vec3 p = floor(x);
    vec3 w = fract(x);
    #if 1
    vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    vec3 du = 30.0*w*w*(w*(w-2.0)+1.0);
    #else
    vec3 u = w*w*(3.0-2.0*w);
    vec3 du = 6.0*w*(1.0-w);
    #endif

    float n = p.x + 317.0*p.y + 157.0*p.z;
    
    float a = hash1(n+0.0);
    float b = hash1(n+1.0);
    float c = hash1(n+317.0);
    float d = hash1(n+318.0);
    float e = hash1(n+157.0);
	float f = hash1(n+158.0);
    float g = hash1(n+474.0);
    float h = hash1(n+475.0);

    float k0 =   a;
    float k1 =   b - a;
    float k2 =   c - a;
    float k3 =   e - a;
    float k4 =   a - b - c + d;
    float k5 =   a - c - e + g;
    float k6 =   a - b - e + f;
    float k7 = - a + b + c - d + e - f - g + h;

    return vec4( -1.0+2.0*(k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z), 
                      2.0* du * vec3( k1 + k4*u.y + k6*u.z + k7*u.y*u.z,
                                      k2 + k5*u.z + k4*u.x + k7*u.z*u.x,
                                      k3 + k6*u.x + k5*u.y + k7*u.x*u.y ) );
}

float noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 w = fract(x);
    
    #if 1
    vec3 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    #else
    vec3 u = w*w*(3.0-2.0*w);
    #endif
    


    float n = p.x + 317.0*p.y + 157.0*p.z;
    
    float a = hash1(n+0.0);
    float b = hash1(n+1.0);
    float c = hash1(n+317.0);
    float d = hash1(n+318.0);
    float e = hash1(n+157.0);
	float f = hash1(n+158.0);
    float g = hash1(n+474.0);
    float h = hash1(n+475.0);

    float k0 =   a;
    float k1 =   b - a;
    float k2 =   c - a;
    float k3 =   e - a;
    float k4 =   a - b - c + d;
    float k5 =   a - c - e + g;
    float k6 =   a - b - e + f;
    float k7 = - a + b + c - d + e - f - g + h;

    return -1.0+2.0*(k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z);
}

vec3 noised( in vec2 x )
{
    vec2 p = floor(x);
    vec2 w = fract(x);
    #if 1
    vec2 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    vec2 du = 30.0*w*w*(w*(w-2.0)+1.0);
    #else
    vec2 u = w*w*(3.0-2.0*w);
    vec2 du = 6.0*w*(1.0-w);
    #endif
    
    float a = hash1(p+vec2(0,0));
    float b = hash1(p+vec2(1,0));
    float c = hash1(p+vec2(0,1));
    float d = hash1(p+vec2(1,1));

    float k0 = a;
    float k1 = b - a;
    float k2 = c - a;
    float k4 = a - b - c + d;

    return vec3( -1.0+2.0*(k0 + k1*u.x + k2*u.y + k4*u.x*u.y), 
                 2.0*du * vec2( k1 + k4*u.y,
                            k2 + k4*u.x ) );
}

float noise( in vec2 x )
{
    vec2 p = floor(x);
    vec2 w = fract(x);
    #if 1
    vec2 u = w*w*w*(w*(w*6.0-15.0)+10.0);
    #else
    vec2 u = w*w*(3.0-2.0*w);
    #endif

    float a = hash1(p+vec2(0,0));
    float b = hash1(p+vec2(1,0));
    float c = hash1(p+vec2(0,1));
    float d = hash1(p+vec2(1,1));
    
    return -1.0+2.0*(a + (b-a)*u.x + (c-a)*u.y + (a - b - c + d)*u.x*u.y);
}

//==========================================================================================
// fbm constructions
//==========================================================================================

const mat3 m3  = mat3( 0.00,  0.80,  0.60,
                      -0.80,  0.36, -0.48,
                      -0.60, -0.48,  0.64 );
const mat3 m3i = mat3( 0.00, -0.80, -0.60,
                       0.80,  0.36, -0.48,
                       0.60, -0.48,  0.64 );
const mat2 m2 = mat2(  0.80,  0.60,
                      -0.60,  0.80 );
const mat2 m2i = mat2( 0.80, -0.60,
                       0.60,  0.80 );

//------------------------------------------------------------------------------------------

float fbm_4( in vec2 x )
{
    float f = 1.9;
    float s = 0.55;
    float a = 0.0;
    float b = 0.5;
    for( int i=ZERO; i<4; i++ )
    {
        float n = noise(x);
        a += b*n;
        b *= s;
        x = f*m2*x;
    }
	return a;
}

float fbm_4( in vec3 x )
{
    float f = 2.0;
    float s = 0.5;
    float a = 0.0;
    float b = 0.5;
    for( int i=ZERO; i<4; i++ )
    {
        float n = noise(x);
        a += b*n;
        b *= s;
        x = f*m3*x;
    }
	return a;
}

vec4 fbmd_7( in vec3 x )
{
    float f = 1.92;
    float s = 0.5;
    float a = 0.0;
    float b = 0.5;
    vec3  d = vec3(0.0);
    mat3  m = mat3(1.0,0.0,0.0,
                   0.0,1.0,0.0,
                   0.0,0.0,1.0);
    for( int i=ZERO; i<7; i++ )
    {
        vec4 n = noised(x);
        a += b*n.x;          // accumulate values		
        d += b*m*n.yzw;      // accumulate derivatives
        b *= s;
        x = f*m3*x;
        m = f*m3i*m;
    }
	return vec4( a, d );
}

vec4 fbmd_8( in vec3 x )
{
    float f = 2.0;
    float s = 0.65;
    float a = 0.0;
    float b = 0.5;
    vec3  d = vec3(0.0);
    mat3  m = mat3(1.0,0.0,0.0,
                   0.0,1.0,0.0,
                   0.0,0.0,1.0);
    for( int i=ZERO; i<8; i++ )
    {
        vec4 n = noised(x);
        a += b*n.x;          // accumulate values		
        if( i<4 )
        d += b*m*n.yzw;      // accumulate derivatives
        b *= s;
        x = f*m3*x;
        m = f*m3i*m;
    }
	return vec4( a, d );
}

float fbm_9( in vec2 x )
{
    float f = 1.9;
    float s = 0.55;
    float a = 0.0;
    float b = 0.5;
    for( int i=ZERO; i<9; i++ )
    {
        float n = noise(x);
        a += b*n;
        b *= s;
        x = f*m2*x;
    }
    
	return a;
}

vec3 fbmd_9( in vec2 x )
{
    float f = 1.9;
    float s = 0.55;
    float a = 0.0;
    float b = 0.5;
    vec2  d = vec2(0.0);
    mat2  m = mat2(1.0,0.0,0.0,1.0);
    for( int i=ZERO; i<9; i++ )
    {
        vec3 n = noised(x);
        a += b*n.x;          // accumulate values		
        d += b*m*n.yz;       // accumulate derivatives
        b *= s;
        x = f*m2*x;
        m = f*m2i*m;
    }

	return vec3( a, d );
}

//==========================================================================================
// specifics to the actual painting
//==========================================================================================


//------------------------------------------------------------------------------------------
// global
//------------------------------------------------------------------------------------------

const vec3  kSunDir = vec3(-0.624695,0.468521,-0.624695);
const float kMaxTreeHeight = 4.8;
const float kMaxHeight = 840.0;

vec3 fog( in vec3 col, float t )
{
    // [TorusFM] uFogMul breathes the fog with bass/gather, burns it on surge.
    vec3 ext = exp2(-t*0.00025*uFogMul*vec3(1,1.5,4)); 
    return col*ext + (1.0-ext)*vec3(0.55,0.55,0.58); // 0.55
}

//------------------------------------------------------------------------------------------
// clouds
//------------------------------------------------------------------------------------------

vec4 cloudsFbm( in vec3 pos )
{
    // [TorusFM] cloud drift rides its own clock (turbulence/energy scaled).
    return fbmd_8(pos*0.0015+vec3(2.0,1.1,1.0)+0.07*vec3(uCloudTime,0.5*uCloudTime,-0.15*uCloudTime));
}

vec4 cloudsMap( in vec3 pos, out float nnd )
{
    float d = abs(pos.y-900.0)-40.0;
    vec3 gra = vec3(0.0,sign(pos.y-900.0),0.0);
    
    vec4 n = cloudsFbm(pos);
    d += 400.0*n.x * (0.7+0.3*gra.y);
    
    if( d>0.0 ) return vec4(-d,0.0,0.0,0.0);
    
    nnd = -d;
    d = min(-d/100.0,0.25);
    
    //gra += 0.1*n.yzw *  (0.7+0.3*gra.y);
    
    return vec4( d, gra );
}

float cloudsShadowFlat( in vec3 ro, in vec3 rd )
{
    float t = (900.0-ro.y)/rd.y;
    if( t<0.0 ) return 1.0;
    vec3 pos = ro + rd*t;
    return cloudsFbm(pos).x;
}

float terrainShadow( in vec3 ro, in vec3 rd, in float mint );

vec4 renderClouds( in vec3 ro, in vec3 rd, float tmin, float tmax, inout float resT, in vec2 px )
{
    vec4 sum = vec4(0.0);

    // bounding volume!!
    float tl = ( 600.0-ro.y)/rd.y;
    float th = (1200.0-ro.y)/rd.y;
    if( tl>0.0 ) tmin = max( tmin, tl ); else return sum;
    if( th>0.0 ) tmax = min( tmax, th );

    float t = tmin;
    //t += 1.0*hash1(gl_FragCoord.xy);
    float lastT = -1.0;
    float thickness = 0.0;
    for(int i=ZERO; i<CLOUD_STEPS; i++)
    { 
        vec3  pos = ro + t*rd; 
        float nnd;
        vec4  denGra = cloudsMap( pos, nnd ); 
        float den = denGra.x;
        float dt = max(0.2,0.011*t);
        //dt *= hash1(px+float(i));
        if( den>0.001 ) 
        { 
            float kk;
            cloudsMap( pos+kSunDir*70.0, kk );
            float sha = 1.0-smoothstep(-200.0,200.0,kk); sha *= 1.5;
            
            vec3 nor = normalize(denGra.yzw);
            float dif = clamp( 0.4+0.6*dot(nor,kSunDir), 0.0, 1.0 )*sha; 
            float fre = clamp( 1.0+dot(nor,rd), 0.0, 1.0 )*sha;
            float occ = 0.2+0.7*max(1.0-kk/200.0,0.0) + 0.1*(1.0-den);
            // lighting
            vec3 lin  = vec3(0.0);
                 lin += vec3(0.70,0.80,1.00)*1.0*(0.5+0.5*nor.y)*occ;
                 lin += vec3(0.10,0.40,0.20)*1.0*(0.5-0.5*nor.y)*occ;
                 lin += vec3(1.00,0.95,0.85)*3.0*dif*occ + 0.1;

            // color
            vec3 col = vec3(0.8,0.8,0.8)*0.45;

            col *= lin;

            col = fog( col, t );

            // front to back blending    
            float alp = clamp(den*0.5*0.125*dt,0.0,1.0);
            col.rgb *= alp;
            sum = sum + vec4(col,alp)*(1.0-sum.a);

            thickness += dt*den;
            if( lastT<0.0 ) lastT = t;            
        }
        else 
        {
            dt = abs(den)+0.2;

        }
        t += dt;
        if( sum.a>0.995 || t>tmax ) break;
    }
    
    //resT = min(resT, (150.0-ro.y)/rd.y );
    if( lastT>0.0 ) resT = min(resT,lastT);
    //if( lastT>0.0 ) resT = mix( resT, lastT, sum.w );
    
    // [TorusFM] release/drop bursts the sun through the cloud deck.
    sum.xyz += max(0.0,1.0-0.0125*thickness)*vec3(1.00,0.60,0.40)*(0.3+0.45*clamp(uSurge,0.0,1.5))*pow(clamp(dot(kSunDir,rd),0.0,1.0),32.0);

    return clamp( sum, 0.0, 1.0 );
}


//------------------------------------------------------------------------------------------
// terrain
//------------------------------------------------------------------------------------------

vec2 terrainMap( in vec2 p )
{
    float e = fbm_9( p/2000.0 + vec2(1.0,-2.0) );
    float a = 1.0-smoothstep( 0.12, 0.13, abs(e+0.12) ); // flag high-slope areas (-0.25, 0.0)
    e = 600.0*e + 600.0;
    
    // cliff
    e += 90.0*smoothstep( 552.0, 594.0, e );
    //e += 90.0*smoothstep( 550.0, 600.0, e );
    
    return vec2(e,a);
}

vec4 terrainMapD( in vec2 p )
{
    vec3 e = fbmd_9( p/2000.0 + vec2(1.0,-2.0) );
    e.x  = 600.0*e.x + 600.0;
    e.yz = 600.0*e.yz;

    // cliff
    vec2 c = smoothstepd( 550.0, 600.0, e.x );
	e.x  = e.x  + 90.0*c.x;
	e.yz = e.yz + 90.0*c.y*e.yz;     // chain rule
    
    e.yz /= 2000.0;
    return vec4( e.x, normalize( vec3(-e.y,1.0,-e.z) ) );
}

vec3 terrainNormal( in vec2 pos )
{
#if 1
    return terrainMapD(pos).yzw;
#else    
    vec2 e = vec2(0.03,0.0);
	return normalize( vec3(terrainMap(pos-e.xy).x - terrainMap(pos+e.xy).x,
                           2.0*e.x,
                           terrainMap(pos-e.yx).x - terrainMap(pos+e.yx).x ) );
#endif    
}

float terrainShadow( in vec3 ro, in vec3 rd, in float mint )
{
    float res = 1.0;
    float t = mint;
#ifdef LOWQUALITY
    for( int i=ZERO; i<TERRAIN_SHADOW_STEPS; i++ )
    {
        vec3  pos = ro + t*rd;
        vec2  env = terrainMap( pos.xz );
        float hei = pos.y - env.x;
        res = min( res, 32.0*hei/t );
        if( res<0.0001 || pos.y>kMaxHeight ) break;
        t += clamp( hei, 2.0+t*0.1, 100.0 );
    }
#else
    for( int i=ZERO; i<128; i++ )
    {
        vec3  pos = ro + t*rd;
        vec2  env = terrainMap( pos.xz );
        float hei = pos.y - env.x;
        res = min( res, 32.0*hei/t );
        if( res<0.0001 || pos.y>kMaxHeight  ) break;
        t += clamp( hei, 0.5+t*0.05, 25.0 );
    }
#endif
    return clamp( res, 0.0, 1.0 );
}

vec2 raymarchTerrain( in vec3 ro, in vec3 rd, float tmin, float tmax )
{
    // bounding plane
    float tp = (kMaxHeight+kMaxTreeHeight-ro.y)/rd.y;
    if( tp>0.0 ) tmax = min( tmax, tp );
    
    // raymarch
    float dis, th;
    float t2 = -1.0;
    float t = tmin; 
    float ot = t;
    float odis = 0.0;
    float odis2 = 0.0;
    for( int i=ZERO; i<TERRAIN_STEPS; i++ )
    {
        th = 0.001*t;

        vec3  pos = ro + t*rd;
        vec2  env = terrainMap( pos.xz );
        float hei = env.x;

        // tree envelope
        float dis2 = pos.y - (hei+kMaxTreeHeight*1.1);
        if( dis2<th ) 
        {
            if( t2<0.0 )
            {
                t2 = ot + (th-odis2)*(t-ot)/(dis2-odis2); // linear interpolation for better accuracy
            }
        }
        odis2 = dis2;
        
        // terrain
        dis = pos.y - hei;
        if( dis<th ) break;
        
        ot = t;
        odis = dis;
        t += dis*0.8*(1.0-0.75*env.y); // slow down in step areas
        if( t>tmax ) break;
    }

    if( t>tmax ) t = -1.0;
    else t = ot + (th-odis)*(t-ot)/(dis-odis); // linear interpolation for better accuracy
    
    return vec2(t,t2);
}

//------------------------------------------------------------------------------------------
// trees
//------------------------------------------------------------------------------------------

float treesMap( in vec3 p, in float rt, out float oHei, out float oMat, out float oDis )
{
    oHei = 1.0;
    oDis = 0.0;
    oMat = 0.0;
        
    float base = terrainMap(p.xz).x; 
    
    float bb = fbm_4(p.xz*0.075);

    float d = 20.0;
    vec2 n = floor( p.xz/2.0 );
    vec2 f = fract( p.xz/2.0 );
    for( int j=0; j<=1; j++ )
    for( int i=0; i<=1; i++ )
    {
        vec2  g = vec2( float(i), float(j) ) - step(f,vec2(0.5));
        // [TorusFM] density control deterministically thins cells into clearings.
        if( hash1( n + g + vec2(37.0,17.0) ) > uTreeKeep ) continue;
        vec2  o = hash2( n + g );
        vec2  v = hash2( n + g + vec2(13.1,71.7) );
        vec2  r = g - f + o;

        float height = kMaxTreeHeight * (0.4+0.8*v.x);
        float width = 0.5 + 0.2*v.x + 0.3*v.y;

        if( bb<0.0 ) width *= 0.5; else height *= 0.7;
        
        vec3  q = vec3(r.x,p.y-base-height*0.5,r.y);
        
        float k = sdEllipsoidY( q, vec2(width,0.5*height) );

        if( k<d )
        { 
            d = k;
            oMat = 0.5*hash1(n+g+111.0);
            if( bb>0.0 ) oMat += 0.5;
            oHei = (p.y - base)/height;
            oHei *= 0.5 + 0.5*length(q) / width;
        }
    }

    // distort ellipsoids to make them look like trees (works only in the distance really)
    if( rt<1200.0 )
    {
        p.y -= 600.0;
        // [TorusFM] wind: mids/turbulence slowly stir the foliage noise field.
        float s = fbm_4( p*3.0 + uWindPhase );
        s = s*s;
        float att = 1.0-smoothstep(100.0,1200.0,rt);
        d += 4.0*s*att;
        oDis = s*att;
    }
    
    return d;
}

float treesShadow( in vec3 ro, in vec3 rd )
{
    float res = 1.0;
    float t = 0.02;
#ifdef LOWQUALITY
    for( int i=ZERO; i<TREE_SHADOW_STEPS; i++ )
    {
        float kk1, kk2, kk3;
        vec3 pos = ro + rd*t;
        float h = treesMap( pos, t, kk1, kk2, kk3 );
        res = min( res, 32.0*h/t );
        t += h;
        if( res<0.001 || t>50.0 || pos.y>kMaxHeight+kMaxTreeHeight ) break;
    }
#else
    for( int i=ZERO; i<150; i++ )
    {
        float kk1, kk2, kk3;
        float h = treesMap( ro + rd*t, t, kk1, kk2, kk3 );
        res = min( res, 32.0*h/t );
        t += h;
        if( res<0.001 || t>120.0 ) break;
    }
#endif
    return clamp( res, 0.0, 1.0 );
}

vec3 treesNormal( in vec3 pos, in float t )
{
    float kk1, kk2, kk3;
#if 0    
    const float eps = 0.005;
    vec2 e = vec2(1.0,-1.0)*0.5773*eps;
    return normalize( e.xyy*treesMap( pos + e.xyy, t, kk1, kk2, kk3 ) + 
                      e.yyx*treesMap( pos + e.yyx, t, kk1, kk2, kk3 ) + 
                      e.yxy*treesMap( pos + e.yxy, t, kk1, kk2, kk3 ) + 
                      e.xxx*treesMap( pos + e.xxx, t, kk1, kk2, kk3 ) );            
#else
    // inspired by tdhooper and klems - a way to prevent the compiler from inlining map() 4 times
    vec3 n = vec3(0.0);
    for( int i=ZERO; i<4; i++ )
    {
        vec3 e = 0.5773*(2.0*vec3((((i+3)>>1)&1),((i>>1)&1),(i&1))-1.0);
        n += e*treesMap(pos+0.005*e, t, kk1, kk2, kk3);
    }
    return normalize(n);
#endif    
}

//------------------------------------------------------------------------------------------
// sky
//------------------------------------------------------------------------------------------

vec3 renderSky( in vec3 ro, in vec3 rd )
{
    // background sky     
    //vec3 col = vec3(0.45,0.6,0.85)/0.85 - rd.y*vec3(0.4,0.36,0.4);
    //vec3 col = vec3(0.4,0.6,1.1) - rd.y*0.4;
    vec3 col = vec3(0.42,0.62,1.1) - rd.y*0.4;

    // clouds
    float t = (2500.0-ro.y)/rd.y;
    if( t>0.0 )
    {
        vec2 uv = (ro+t*rd).xz;
        float cl = fbm_9( uv*0.00104 );
        float dl = smoothstep(-0.2,0.6,cl);
        col = mix( col, vec3(1.0), 0.12*dl );
    }
    
	// sun glare    
    float sun = clamp( dot(kSunDir,rd), 0.0, 1.0 );
    col += 0.2*vec3(1.0,0.6,0.3)*pow( sun, 32.0 );
    
	return col;
}

//------------------------------------------------------------------------------------------
// main image making function
//------------------------------------------------------------------------------------------

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 o = hash2( vec2(iFrame,1) ) - 0.5;
    
    vec2 p = (2.0*(fragCoord+o)-iResolution.xy)/ iResolution.y;
    
    //----------------------------------
    // setup
    //----------------------------------

    // camera
    float time = iTime;
    vec3 ro = vec3(0.0, 401.5, 6.0);
    vec3 ta = vec3(0.0, 403.5, -90.0 + ro.z );
    
    //ro += vec3(10.0*sin(0.02*time),0.0,-10.0*sin(0.2+0.031*time))
    
    ro.x -= 80.0*sin(0.01*time);
    ta.x -= 86.0*sin(0.01*time);

    // [TorusFM] audio camera: bass leans down-valley, swell lifts the gaze.
    // (Mirrored on the CPU for the previous-frame reprojection rows.)
    ro.z -= uCamPush;
    ta.z -= uCamPush;
    ta.y += uCamLift;

    // ray
    mat3 ca = setCamera( ro, ta, 0.0 );
    // [TorusFM] fl replaces the fixed 1.5 focal so the scale control zooms.
    float fl = 1.5*uZoom;
    vec3 rd = ca * normalize( vec3(p,fl));

	float resT = 2000.0;

    //----------------------------------
    // sky
    //----------------------------------

    vec3 col = renderSky( ro, rd );

    // [TorusFM] sky coverage for backdrop compositing (1 = scene, 0 = sky).
    float covered = 0.0;

    //----------------------------------
    // raycast terrain and tree envelope
    //----------------------------------
    {
    const float tmax = 2000.0;
    int   obj = 0;
    vec2 t = raymarchTerrain( ro, rd, 15.0, tmax );
    if( t.x>0.0 )
    {
        resT = t.x;
        obj = 1;
    }

    //----------------------------------
    // raycast trees, if needed
    //----------------------------------
    float hei, mid, displa;
    
    if( t.y>0.0 )
    {
        float tf = t.y;
        float tfMax = (t.x>0.0)?t.x:tmax;
        for(int i=ZERO; i<TREE_STEPS; i++) 
        { 
            vec3  pos = ro + tf*rd; 
            float dis = treesMap( pos, tf, hei, mid, displa); 
            if( dis<(0.000125*tf) ) break;
            tf += dis;
            if( tf>tfMax ) break;
        }
        if( tf<tfMax )
        {
            resT = tf;
            obj = 2;
        }
    }

    //----------------------------------
    // shade
    //----------------------------------
    if( obj>0 )
    {
        covered = 1.0;
        vec3 pos  = ro + resT*rd;
        vec3 epos = pos + vec3(0.0,4.8,0.0);

        float sha1  = terrainShadow( pos+vec3(0,0.02,0), kSunDir, 0.02 );
        //sha1 *= smoothstep(-0.3,0.0,cloudsShadowFlat(epos, kSunDir));
        sha1 *= smoothstep(-0.325,-0.075,cloudsShadowFlat(epos, kSunDir));
        
        #ifndef LOWQUALITY
        float sha2  = treesShadow( pos+vec3(0,0.02,0), kSunDir );
        #endif

        vec3 tnor = terrainNormal( pos.xz );
        vec3 nor;
        
        vec3 speC = vec3(1.0);
        //----------------------------------
        // terrain
        //----------------------------------
        if( obj==1 )
        {
            // bump map
            nor = normalize( tnor + 0.8*(1.0-abs(tnor.y))*0.8*fbmd_7( (pos-vec3(0,600,0))*0.15*vec3(1.0,0.2,1.0) ).yzw );

            col = vec3(0.18,0.12,0.10)*.85;

            col = 1.0*mix( col, vec3(0.1,0.1,0.0)*0.2, smoothstep(0.7,0.9,nor.y) );      
            float dif = clamp( dot( nor, kSunDir), 0.0, 1.0 ); 
            dif *= sha1;
            #ifndef LOWQUALITY
            dif *= sha2;
            #endif

            float bac = clamp( dot(normalize(vec3(-kSunDir.x,0.0,-kSunDir.z)),nor), 0.0, 1.0 );
            float foc = clamp( (pos.y/2.0-180.0)/130.0, 0.0,1.0);
            float dom = clamp( 0.5 + 0.5*nor.y, 0.0, 1.0 );
            vec3  lin  = 1.0*0.2*mix(0.1*vec3(0.1,0.2,0.1),vec3(0.7,0.9,1.5)*3.0,dom)*foc;
                  lin += 1.0*8.5*vec3(1.0,0.9,0.8)*dif;        
                  lin += 1.0*0.27*vec3(1.1,1.0,0.9)*bac*foc;
            speC = vec3(4.0)*dif*smoothstep(20.0,0.0,abs(pos.y/2.0-310.0)-20.0);

            col *= lin;
        }
        //----------------------------------
        // trees
        //----------------------------------
        else //if( obj==2 )
        {
            vec3 gnor = treesNormal( pos, resT );
            
            nor = normalize( gnor + 2.0*tnor );

            // --- lighting ---
            vec3  ref = reflect(rd,nor);
            float occ = clamp(hei,0.0,1.0) * pow(1.0-2.0*displa,3.0);
            float dif = clamp( 0.1 + 0.9*dot( nor, kSunDir), 0.0, 1.0 ); 
            dif *= sha1;
            if( dif>0.0001 )
            {
                float a = clamp( 0.5+0.5*dot(tnor,kSunDir), 0.0, 1.0);
                a = a*a;
                a *= occ;
                a *= 0.6;
                a *= smoothstep(60.0,200.0,resT);
                // tree shadows with fake transmission
                #ifdef LOWQUALITY
                float sha2  = treesShadow( pos+kSunDir*0.1, kSunDir );
                #endif
                dif *= a+(1.0-a)*sha2;
            }
            float dom = clamp( 0.5 + 0.5*nor.y, 0.0, 1.0 );
            float bac = clamp( 0.5+0.5*dot(normalize(vec3(-kSunDir.x,0.0,-kSunDir.z)),nor), 0.0, 1.0 );                 
            float fre = clamp(1.0+dot(nor,rd),0.0,1.0);
            //float spe = pow( clamp(dot(ref,kSunDir),0.0, 1.0), 9.0 )*dif*(0.2+0.8*pow(fre,5.0))*occ;

            // --- lights ---
            vec3 lin  = 12.0*vec3(1.2,1.0,0.7)*dif*occ*(2.5-1.5*smoothstep(0.0,120.0,resT));
                 lin += 0.55*mix(0.1*vec3(0.1,0.2,0.0),vec3(0.6,1.0,1.0),dom*occ);
                 lin += 0.07*vec3(1.0,1.0,0.9)*bac*occ;
                 lin += 1.10*vec3(0.9,1.0,0.8)*pow(fre,5.0)*occ*(1.0-smoothstep(100.0,200.0,resT));
            // [TorusFM] hats roll spec glitter across the canopy.
            speC = dif*vec3(1.0,1.1,1.5)*(1.2 + 0.9*clamp(uHat,0.0,1.2));

            // --- material ---
            float brownAreas = fbm_4( pos.zx*0.015 );
            col = vec3(0.2,0.2,0.05);
            col = mix( col, vec3(0.32,0.2,0.05), smoothstep(0.2,0.9,fract(2.0*mid)) );
            col *= (mid<0.5)?0.65+0.35*smoothstep(300.0,600.0,resT)*smoothstep(700.0,500.0,pos.y):1.0;
            col = mix( col, vec3(0.25,0.16,0.01)*0.825, 0.7*smoothstep(0.1,0.3,brownAreas)*smoothstep(0.5,0.8,tnor.y) );
            col *= 1.0-0.5*smoothstep(400.0,700.0,pos.y);
            col *= lin;
        }

        // spec
        vec3  ref = reflect(rd,nor);            
        float fre = clamp(1.0+dot(nor,rd),0.0,1.0);
        float spe = 3.0*pow( clamp(dot(ref,kSunDir),0.0, 1.0), 9.0 )*(0.05+0.95*pow(fre,5.0));
        col += spe*speC;

        col = fog(col,resT);
    }
    }



    float isCloud = 0.0;
    //----------------------------------
    // clouds
    //----------------------------------
    {
        vec4 res = renderClouds( ro, rd, 0.0, resT, resT, fragCoord );
        col = col*(1.0-res.w) + res.xyz;
        isCloud = res.w;
    }
    // [TorusFM] clouds count as coverage for backdrop compositing.
    covered = max( covered, isCloud );

    //----------------------------------
    // final
    //----------------------------------
    
    // sun glare    
    float sun = clamp( dot(kSunDir,rd), 0.0, 1.0 );
    // [TorusFM] the surge lets the glare flare wider on release/drop.
    col += (0.25+0.30*clamp(uSurge,0.0,1.5))*vec3(0.8,0.4,0.2)*pow( sun, 4.0 );
 

    // gamma
    //col = sqrt( clamp(col,0.0,1.0) );
    col = pow( clamp(col*1.1-0.02,0.0,1.0), vec3(0.4545) );

    // contrast
    col = col*col*(3.0-2.0*col);            
    
    // color grade    
    col = pow( col, vec3(1.0,0.92,1.0) );   // soft green
    col *= vec3(1.02,0.99,0.9 );            // tint red
    col.z = col.z+0.1;                      // bias blue
    
    //------------------------------------------
	// reproject from previous frame and average
    //------------------------------------------

    // [TorusFM] The previous-frame camera arrives as fp32 uniforms instead of
    // being stored in the buffer's corner pixels — identical math, but no
    // half-float quantization wobble in the reprojection, and no reserved
    // pixels to mask out of the history.
    mat3x4 oldCam = mat3x4( uOldCam0, uOldCam1, uOldCam2 );
    
    // world space
    vec4 wpos = vec4(ro + rd*resT,1.0);
    // camera space
    vec3 cpos = (wpos*oldCam); // note inverse multiply
    // ndc space
    vec2 npos = fl * cpos.xy / cpos.z;
    // screen space
    vec2 spos = 0.5 + 0.5*npos*vec2(iResolution.y/iResolution.x,1.0);
    // undo dither
    spos -= o/iResolution.xy;

    vec4 ocol = textureLod( iChannel0, spos, 0.0 );
    // [TorusFM] Self-heal the feedback loop: reject NaN/inf history (one bad
    // frame would otherwise poison the accumulation forever) and clamp the
    // fresh sample so infinities can never enter it.
    col = clamp( col, 0.0, 8.0 );
    if( iFrame==0 || any(isnan(ocol)) || any(isinf(ocol)) ) ocol = vec4(col,covered);
    float blendNew = 0.1+0.8*isCloud;
    col = mix( ocol.xyz, col, blendNew );
    // [TorusFM] alpha carries smoothed sky coverage for backdrop mode.
    covered = mix( ocol.w, covered, blendNew );

    fragColor = vec4( col, covered );
}

// [TorusFM] GLSL3 requires an explicit fragment output.
out vec4 torusFragOut;
void main() {
  mainImage(torusFragOut, gl_FragCoord.xy);
}
`;
}

/**
 * Image pass — the original applies the vignette; TorusFM adds the
 * full-frame-rate audio grading here so fast transients (kick, drop) stay
 * crisp instead of being smeared by Buffer A's temporal filter.
 */
const IMAGE_FRAGMENT = /* glsl */ `
uniform sampler2D iChannel0;
uniform vec3 iResolution;
uniform float uBgAlpha;
uniform float uKickPulse;
uniform float uSurgeFast;
uniform float uStillness;
uniform float uPaletteMix;
uniform vec3 uColorBass;
uniform vec3 uColorMid;
uniform vec3 uColorHigh;

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 p = fragCoord/iResolution.xy;

    vec4 buf = texture( iChannel0, p );
    vec3 col = buf.xyz;

    // [TorusFM] instant audio grade: kick pops the exposure, the drop lifts
    // it, silence drains a little saturation.
    col *= 1.0 + 0.08*clamp(uKickPulse,0.0,1.2) + 0.07*clamp(uSurgeFast,0.0,1.5);
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col = mix(col, vec3(lum), 0.12*clamp(uStillness,0.0,1.0));

    // [TorusFM] gentle palette wash: shadows lean to the Low color, mids to
    // Mids, lights to High. Luma-normalized so the tint shifts hue without
    // lifting exposure — the forest stays the artwork, the palette sets the
    // mood.
    vec3 grade = mix(uColorBass, uColorMid, smoothstep(0.0, 0.55, lum));
    grade = mix(grade, uColorHigh, smoothstep(0.55, 1.0, lum));
    vec3 tint = grade / max(dot(grade, vec3(0.299,0.587,0.114)), 1e-3);
    // Pull the tint most of the way back to neutral — the painting keeps its
    // own color story, the palette only breathes on it.
    tint = mix(vec3(1.0), tint, 0.3);
    col = mix(col, col*tint, clamp(uPaletteMix, 0.0, 0.5));

    col *= 0.5 + 0.5*pow( 16.0*p.x*p.y*(1.0-p.x)*(1.0-p.y), 0.05 );

    // [TorusFM] alpha: opaque normally; in backdrop mode the sky opens up
    // (Buffer A's alpha carries temporal sky coverage).
    float alpha = mix( clamp(buf.w, 0.0, 1.0), 1.0, uBgAlpha );
    fragColor = vec4( col, alpha );
}

// [TorusFM] GLSL3 requires an explicit fragment output.
out vec4 torusFragOut;
void main() {
  mainImage(torusFragOut, gl_FragCoord.xy);
}
`;

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function smoothToward(
  current: number,
  target: number,
  dt: number,
  riseTau: number,
  fallTau: number,
) {
  // NaN-safe: a non-finite target is ignored, a non-finite accumulator heals
  // itself. One bad audio-metric frame must never poison the smoothers (their
  // values feed the shader's temporal feedback loop).
  if (!Number.isFinite(target)) target = 0;
  if (!Number.isFinite(current)) return target;
  const tau = target > current ? riseTau : fallTau;
  const k = 1 - Math.exp(-dt / Math.max(tau, 1e-4));
  return current + (target - current) * k;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

interface CameraRows {
  row0: THREE.Vector4;
  row1: THREE.Vector4;
  row2: THREE.Vector4;
}

/**
 * CPU mirror of the shader's camera: same pan, same [TorusFM] push/lift.
 * Produces the rows the original stored in the buffer's corner pixels —
 * vec4(basisColumn, -dot(basisColumn, ro)) for cu/cv/cw.
 */
function writeCameraRows(
  time: number,
  camPush: number,
  camLift: number,
  out: CameraRows,
  scratch: {
    ro: THREE.Vector3;
    ta: THREE.Vector3;
    cw: THREE.Vector3;
    cu: THREE.Vector3;
    cv: THREE.Vector3;
  },
): void {
  const { ro, ta, cw, cu, cv } = scratch;
  ro.set(0 - 80 * Math.sin(0.01 * time), 401.5, 6 - camPush);
  ta.set(0 - 86 * Math.sin(0.01 * time), 403.5 + camLift, -90 + 6 - camPush);
  cw.copy(ta).sub(ro).normalize();
  // cross(cw, up) with up=(0,1,0) simplifies to (-cw.z, 0, cw.x).
  cu.set(-cw.z, 0, cw.x).normalize();
  cv.copy(cu).cross(cw).normalize();
  out.row0.set(cu.x, cu.y, cu.z, -cu.dot(ro));
  out.row1.set(cv.x, cv.y, cv.z, -cv.dot(ro));
  out.row2.set(cw.x, cw.y, cw.z, -cw.dot(ro));
}

export function RainforestReverieScene({
  palette,
  tier,
  scale = 1,
  speed = 1,
  turbulence = 1,
  density = 1,
  backdrop = false,
}: VisualizerSceneProps) {
  const mods = useModulation();
  const metricsRef = useMetricsRef();
  const imageMatRef = useRef<THREE.ShaderMaterial>(null);
  const { gl, size, viewport } = useThree();

  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const cloudTimeRef = useRef(0);
  const windPhase = useRef(new THREE.Vector3());
  const bassSmooth = useRef(0);
  const stillnessSmooth = useRef(0);
  const gatherSmooth = useRef(0);
  const swellSmooth = useRef(0.15);
  const surgeSmooth = useRef(0);
  const afterglowSmooth = useRef(0);
  const kickSmooth = useRef(0);
  const hatSmooth = useRef(0);
  const fogMulSmooth = useRef(1);
  const camPushSmooth = useRef(0);
  const camLiftSmooth = useRef(0);
  const prevRows = useRef<CameraRows>({
    row0: new THREE.Vector4(1, 0, 0, 0),
    row1: new THREE.Vector4(0, 1, 0, 0),
    row2: new THREE.Vector4(0, 0, 1, 0),
  });
  const currRows = useRef<CameraRows>({
    row0: new THREE.Vector4(1, 0, 0, 0),
    row1: new THREE.Vector4(0, 1, 0, 0),
    row2: new THREE.Vector4(0, 0, 1, 0),
  });
  const camScratch = useRef({
    ro: new THREE.Vector3(),
    ta: new THREE.Vector3(),
    cw: new THREE.Vector3(),
    cu: new THREE.Vector3(),
    cv: new THREE.Vector3(),
  });

  const config = useMemo(() => getRainforestPortConfig(tier as RainforestTier), [tier]);
  const kitAmp = tier === 'low' ? 0.78 : tier === 'mid' ? 0.9 : 1;

  // Buffer A: its own scene + material rendered into the ping-pong targets.
  const buffer = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(FULLSCREEN_TRIANGLE, 3));
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader: buildBufferShader(config),
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      uniforms: {
        iChannel0: { value: null },
        iResolution: { value: new THREE.Vector3(1, 1, 1) },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uZoom: { value: 1 },
        uFogMul: { value: 1 },
        uCamPush: { value: 0 },
        uCamLift: { value: 0 },
        uWindPhase: { value: new THREE.Vector3() },
        uCloudTime: { value: 0 },
        uSurge: { value: 0 },
        uHat: { value: 0 },
        uTreeKeep: { value: 1.01 },
        uOldCam0: { value: new THREE.Vector4(1, 0, 0, 0) },
        uOldCam1: { value: new THREE.Vector4(0, 1, 0, 0) },
        uOldCam2: { value: new THREE.Vector4(0, 0, 1, 0) },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, geometry, material };
  }, [config]);

  useEffect(() => {
    return () => {
      buffer.geometry.dispose();
      buffer.material.dispose();
    };
  }, [buffer]);

  // Half-float ping-pong history targets at the tier's internal resolution.
  const targets = useMemo(() => {
    const dims = bufferSizeFor(size.width * viewport.dpr, size.height * viewport.dpr, config);
    // Half-float needs EXT_color_buffer_float to be renderable; byte targets
    // are the (slightly banded) fallback for ancient GPUs.
    const type = gl.extensions.has('EXT_color_buffer_float')
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;
    const make = () => {
      const rt = new THREE.WebGLRenderTarget(dims.width, dims.height, {
        type,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      });
      rt.texture.generateMipmaps = false;
      return rt;
    };
    return { read: make(), write: make(), width: dims.width, height: dims.height };
  }, [gl, size.width, size.height, viewport.dpr, config]);

  useEffect(() => {
    // New targets have no history — restart the temporal accumulation, and
    // touch both targets once so their textures exist before being sampled.
    frameRef.current = 0;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(targets.read);
    gl.setRenderTarget(targets.write);
    gl.setRenderTarget(prev);
    return () => {
      targets.read.dispose();
      targets.write.dispose();
    };
  }, [gl, targets]);

  const imageUniforms = useMemo(
    () => ({
      iChannel0: { value: null as THREE.Texture | null },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      uBgAlpha: { value: 1 },
      uKickPulse: { value: 0 },
      uSurgeFast: { value: 0 },
      uStillness: { value: 0 },
      uPaletteMix: { value: 0.2 },
      uColorBass: { value: new THREE.Color(1, 1, 1) },
      uColorMid: { value: new THREE.Color(1, 1, 1) },
      uColorHigh: { value: new THREE.Color(1, 1, 1) },
    }),
    // Colors rewritten every frame from the living palette.
    [],
  );

  useFrame((_state, delta) => {
    const imageMat = imageMatRef.current;
    if (!imageMat) return;
    const m = metricsRef.current;
    // clamp() maps NaN/inf to the lower bound — dt and pace feed the shader
    // clocks, and a single NaN would poison the temporal history.
    const dt = clamp(delta, 0, 0.08);
    const mv = mods.current;
    const pace = clamp(mv.speed ?? speed, 0.05, 4);
    const turb = clamp(mv.turbulence ?? turbulence, 0, 2);
    const dens = clamp(mv.density ?? density, 0.05, 1);

    // The original's clock: camera pan + everything time-based. Speed only —
    // pausing it on silence would freeze the artwork, which reads as a glitch.
    timeRef.current += dt * pace;

    const stillnessTarget = Math.min(
      1,
      Math.max(m.holdBreath, m.silence * 0.92) + Math.min(m.holdBreath, m.silence) * 0.15,
    );
    stillnessSmooth.current = smoothToward(
      stillnessSmooth.current,
      stillnessTarget,
      dt,
      0.14,
      0.08,
    );
    bassSmooth.current = smoothToward(bassSmooth.current, clamp(m.bass, 0, 2), dt, 0.09, 0.3);
    gatherSmooth.current = smoothToward(gatherSmooth.current, m.gather, dt, 0.04, 0.14);
    swellSmooth.current = smoothToward(swellSmooth.current, m.swell, dt, 0.12, 0.45);
    surgeSmooth.current = smoothToward(
      surgeSmooth.current,
      Math.min(1.25, m.release * 0.95 + m.dropEvent * 1.1 + m.impact * 0.35) * kitAmp,
      dt,
      0.03,
      0.22,
    );
    afterglowSmooth.current = smoothToward(afterglowSmooth.current, m.afterglow, dt, 0.18, 0.85);
    kickSmooth.current = smoothToward(
      kickSmooth.current,
      Math.min(1.2, m.kick) * kitAmp,
      dt,
      0.028,
      0.12,
    );
    hatSmooth.current = smoothToward(
      hatSmooth.current,
      Math.min(1.2, m.hat) * kitAmp,
      dt,
      0.02,
      0.09,
    );

    // Wind stirs the foliage noise field; stillness becalms it.
    const windRate =
      pace *
      (0.25 + swellSmooth.current * 0.9 + clamp(m.mid, 0, 2) * 0.4) *
      (0.3 + turb * 0.7) *
      (1 - stillnessSmooth.current * 0.85);
    windPhase.current.x += dt * windRate * 0.9;
    windPhase.current.y += dt * windRate * 0.6;
    windPhase.current.z += dt * windRate * 0.5;

    // Clouds drift on their own clock so turbulence/energy push the weather.
    cloudTimeRef.current +=
      dt *
      pace *
      (0.5 + turb * 0.5 + Math.min(Number.isFinite(m.energy) ? m.energy : 0, 1.5) * 0.35);

    // Fog breathes with the music (Buffer A's temporal filter softens it).
    // Centered so ordinary music holds the original's fog (~1.0): steady bass
    // barely thickens it, gathers and silence roll the mist in, the drop
    // burns it off.
    const fogTarget = clamp(
      0.92 +
        bassSmooth.current * 0.28 +
        gatherSmooth.current * 0.7 +
        stillnessSmooth.current * 0.55 -
        surgeSmooth.current * 0.5,
      0.45,
      2.2,
    );
    fogMulSmooth.current = smoothToward(fogMulSmooth.current, fogTarget, dt, 0.25, 0.5);

    // Bass leans the camera down the valley; swell lifts the gaze. Both stay
    // small — the shot is composed, we sway inside it, we don't leave it.
    camPushSmooth.current = smoothToward(
      camPushSmooth.current,
      bassSmooth.current * 3,
      dt,
      0.3,
      0.8,
    );
    camLiftSmooth.current = smoothToward(
      camLiftSmooth.current,
      swellSmooth.current * 1.2,
      dt,
      0.35,
      0.9,
    );

    const zoom = clamp(mv.scale ?? scale, 0.55, 2.2);

    // Camera rows: mirror the shader's camera for reprojection history.
    writeCameraRows(
      timeRef.current,
      camPushSmooth.current,
      camLiftSmooth.current,
      currRows.current,
      camScratch.current,
    );
    if (frameRef.current === 0) {
      prevRows.current.row0.copy(currRows.current.row0);
      prevRows.current.row1.copy(currRows.current.row1);
      prevRows.current.row2.copy(currRows.current.row2);
    }

    // ---- Buffer A pass ----
    const bu = buffer.material.uniforms;
    bu.iChannel0!.value = targets.read.texture;
    (bu.iResolution!.value as THREE.Vector3).set(targets.width, targets.height, 1);
    bu.uTime!.value = timeRef.current;
    bu.uFrame!.value = frameRef.current;
    bu.uZoom!.value = zoom;
    bu.uFogMul!.value = fogMulSmooth.current;
    bu.uCamPush!.value = camPushSmooth.current;
    bu.uCamLift!.value = camLiftSmooth.current;
    (bu.uWindPhase!.value as THREE.Vector3).copy(windPhase.current);
    bu.uCloudTime!.value = cloudTimeRef.current;
    bu.uSurge!.value = surgeSmooth.current;
    bu.uHat!.value = hatSmooth.current;
    // 0.4..1.01 — the hash never reaches 1.01, so full density keeps all.
    bu.uTreeKeep!.value = 0.4 + dens * 0.61;
    (bu.uOldCam0!.value as THREE.Vector4).copy(prevRows.current.row0);
    (bu.uOldCam1!.value as THREE.Vector4).copy(prevRows.current.row1);
    (bu.uOldCam2!.value as THREE.Vector4).copy(prevRows.current.row2);

    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(targets.write);
    gl.render(buffer.scene, buffer.camera);
    gl.setRenderTarget(prevTarget);

    // Swap: what we just wrote becomes this frame's display + next history.
    const written = targets.write;
    targets.write = targets.read;
    targets.read = written;

    // ---- Image pass (visible mesh) ----
    imageMat.uniforms.iChannel0!.value = written.texture;
    (imageMat.uniforms.iResolution!.value as THREE.Vector3).set(
      size.width * viewport.dpr,
      size.height * viewport.dpr,
      1,
    );
    imageMat.uniforms.uBgAlpha!.value = backdrop ? 0 : 1;
    imageMat.uniforms.uKickPulse!.value = kickSmooth.current;
    imageMat.uniforms.uSurgeFast!.value = surgeSmooth.current;
    imageMat.uniforms.uStillness!.value = stillnessSmooth.current;
    imageMat.uniforms.uPaletteMix!.value = clamp(0.2 + afterglowSmooth.current * 0.08, 0, 0.3);
    (imageMat.uniforms.uColorBass!.value as THREE.Color).set(palette.bass);
    (imageMat.uniforms.uColorMid!.value as THREE.Color).set(palette.mid);
    (imageMat.uniforms.uColorHigh!.value as THREE.Color).set(palette.high);

    // Roll history forward.
    prevRows.current.row0.copy(currRows.current.row0);
    prevRows.current.row1.copy(currRows.current.row1);
    prevRows.current.row2.copy(currRows.current.row2);
    frameRef.current += 1;
  });

  return (
    <mesh frustumCulled={false} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[FULLSCREEN_TRIANGLE, 3]}
          count={3}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={imageMatRef}
        glslVersion={THREE.GLSL3}
        vertexShader={vertexShader}
        fragmentShader={IMAGE_FRAGMENT}
        uniforms={imageUniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
