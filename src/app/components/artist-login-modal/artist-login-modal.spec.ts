import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArtistLoginModal } from './artist-login-modal';

describe('ArtistLoginModal', () => {
  let component: ArtistLoginModal;
  let fixture: ComponentFixture<ArtistLoginModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtistLoginModal],
    }).compileComponents();

    fixture = TestBed.createComponent(ArtistLoginModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
