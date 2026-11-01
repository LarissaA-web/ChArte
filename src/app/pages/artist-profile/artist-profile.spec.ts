import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { ArtistProfile } from './artist-profile';

describe('ArtistProfile', () => {
  let component: ArtistProfile;
  let fixture: ComponentFixture<ArtistProfile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtistProfile],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(ArtistProfile);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
